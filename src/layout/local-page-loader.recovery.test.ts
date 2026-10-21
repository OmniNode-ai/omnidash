import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPageConfig, loadLocalPageSnapshots, RUN_TRACE_TOPIC, DELEGATION_DECISIONS_TOPIC, PER_RUN_TOPICS } from './local-page-loader';
import type { ProjectionSnapshot } from '../data-source/protocol-snapshot-source';

// Declared failure modes: success lost after soft deadline; stale navigation wins;
// trace loses correlation; delayed newest decision never loads its trace;
// late rejection becomes unhandled; shared readers cross their current-state guards.
const QUALITY='onex.snapshot.projection.delegation.quality-gate.v1';
const snapshot=(rows: unknown[]): ProjectionSnapshot=>({rows,rowCount:rows.length,dataFreshness:'fresh',latestEventAt:null,readAt:new Date().toISOString()});
function deferred() { let resolve!: (s:ProjectionSnapshot)=>void; let reject!: (e:Error)=>void; const promise=new Promise<ProjectionSnapshot>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function setup(pageName: 'overview'|'workflow', delayed:string) {
  const page=loadLocalPageConfig(pageName), gate=deferred();
  const source={async *readAll(){yield [];},readSnapshot:vi.fn((topic:string, params?:Readonly<Record<string,string>>)=>topic===delayed?gate.promise:Promise.resolve(snapshot(topic===RUN_TRACE_TOPIC?[{correlation_id:params?.correlation_id,step_sequence:1}]:[])))};
  const availableTopics=new Set(page.components.flatMap(c=>c.data_bindings??[]).map(b=>b.projection_topic));
  return {page,gate,source,availableTopics};
}
beforeEach(()=>vi.useFakeTimers()); afterEach(()=>vi.useRealTimers());
describe('soft deadline recovery',()=>{
  it('keeps the five-second typed state but publishes a later successful result',async()=>{
    const s=setup('overview',QUALITY), publish=vi.fn();
    const load=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:publish});
    await vi.advanceTimersByTimeAsync(5000);
    expect((await load).find(x=>x.topic===QUALITY)?.failure?.kind).toBe('timeout');
    publish.mockClear();s.gate.resolve(snapshot([{total_checks:47}]));await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({topic:QUALITY,rows:[{total_checks:47}]}));
    expect(publish.mock.calls[0][0].failure).toBeUndefined();
  });
  it('does not publish after the caller is superseded',async()=>{
    const s=setup('overview',QUALITY), publish=vi.fn();let current=true;
    const load=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:publish,isCurrent:()=>current});
    await vi.advanceTimersByTimeAsync(5000);await load;publish.mockClear();current=false;
    s.gate.resolve(snapshot([{total_checks:99}]));await vi.advanceTimersByTimeAsync(0);expect(publish).not.toHaveBeenCalled();
  });
  it('attaches the exact requested run id to late trace publication',async()=>{
    const s=setup('workflow',RUN_TRACE_TOPIC), publish=vi.fn();
    const load=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,runId:'run-a',onSnapshot:publish});
    await vi.advanceTimersByTimeAsync(5000);await load;publish.mockClear();
    s.gate.resolve(snapshot([{correlation_id:'run-a',step_sequence:1}]));await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({topic:RUN_TRACE_TOPIC,runId:'run-a'}));
  });
  it('loads the correct trace when the newest decision arrives late',async()=>{
    const s=setup('workflow',DELEGATION_DECISIONS_TOPIC), publish=vi.fn();
    const load=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:publish});
    await vi.advanceTimersByTimeAsync(5000);await load;publish.mockClear();
    s.gate.resolve(snapshot([{correlation_id:'late-newest',written_at:'2026-10-19T06:00:00Z'}]));await vi.advanceTimersByTimeAsync(0);
    expect(s.source.readSnapshot).toHaveBeenCalledWith(RUN_TRACE_TOPIC,{correlation_id:'late-newest'});
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({topic:RUN_TRACE_TOPIC,runId:'late-newest'}));
  });
  it('does not start late trace work after navigation',async()=>{
    const s=setup('workflow',DELEGATION_DECISIONS_TOPIC), publish=vi.fn();let current=true;
    const load=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:publish,isCurrent:()=>current});
    await vi.advanceTimersByTimeAsync(5000);await load;current=false;
    s.gate.resolve(snapshot([{correlation_id:'old',written_at:'2026-10-19T06:00:00Z'}]));await vi.advanceTimersByTimeAsync(0);
    expect(s.source.readSnapshot.mock.calls.filter(([topic])=>topic===RUN_TRACE_TOPIC)).toHaveLength(0);
  });
  it('handles late rejections without publishing a fabricated success',async()=>{
    const s=setup('overview',QUALITY), publish=vi.fn();
    const load=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:publish});
    await vi.advanceTimersByTimeAsync(5000);await load;publish.mockClear();s.gate.reject(new Error('unavailable'));
    await vi.advanceTimersByTimeAsync(0);expect(publish).not.toHaveBeenCalled();
  });
  // Codex review 2026-10-21 14:17Z: with no run to name, a per-run exposure must never be read without an id,
  // whether or not the catalogue serves it.
  it.each([['served',true],['not served',false]])('reads no per-run exposure when no run can be named and it is %s',async(_label,served)=>{
    const s=setup('workflow','none');
    const available=new Set([...s.availableTopics].filter(topic=>served||!PER_RUN_TOPICS.has(topic)));
    const loaded=await loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:available});
    expect(s.source.readSnapshot.mock.calls.filter(([topic])=>PER_RUN_TOPICS.has(topic))).toHaveLength(0);
    const perRun=loaded.filter(x=>PER_RUN_TOPICS.has(x.topic));
    expect(perRun.length).toBeGreaterThan(0);
    for (const x of perRun) {
      expect(x.runId).toBeNull();
      expect(x.failure?.kind).toBe(served?undefined:'not-served');
    }
  });
  it('shared in-flight readers retain independent caller guards',async()=>{
    const s=setup('overview',QUALITY), old=vi.fn(), fresh=vi.fn();let current=true;
    const a=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:old,isCurrent:()=>current});
    const b=loadLocalPageSnapshots(s.page,s.source,{mode:'http',availableTopics:s.availableTopics,onSnapshot:fresh});
    await vi.advanceTimersByTimeAsync(5000);await Promise.all([a,b]);old.mockClear();fresh.mockClear();current=false;
    s.gate.resolve(snapshot([{total_checks:9}]));await vi.advanceTimersByTimeAsync(0);
    expect(old).not.toHaveBeenCalled();expect(fresh).toHaveBeenCalledTimes(1);
    expect(s.source.readSnapshot.mock.calls.filter(([topic])=>topic===QUALITY)).toHaveLength(1);
  });
});
