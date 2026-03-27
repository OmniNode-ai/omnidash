/**
 * Pipeline Overview Dashboard (OMN-6753)
 *
 * High-level pipeline status overview. Aggregates signals from existing
 * pipeline-health, pipeline-budget, and epic-pipeline dashboards into
 * a single landing page.
 *
 * No dedicated backend endpoint exists yet -- this page will link to
 * the granular sub-dashboards until a unified pipeline API is built.
 */

import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Workflow, GitBranch, DollarSign, HeartPulse } from 'lucide-react';

const PIPELINE_PAGES = [
  {
    title: 'Pipeline Health',
    url: '/pipeline-health',
    icon: HeartPulse,
    description: 'Per-ticket pipeline state, stuck detection, and CDQA gate results',
  },
  {
    title: 'Epic Pipeline',
    url: '/epic-pipeline',
    icon: GitBranch,
    description: 'Epic-team pipeline run status and ticket progress',
  },
  {
    title: 'Pipeline Budget',
    url: '/pipeline-budget',
    icon: DollarSign,
    description: 'Token and cost budget caps per pipeline run',
  },
];

export default function PipelineDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground mt-1">Unified pipeline health and status overview</p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Workflow className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            This dashboard will aggregate pipeline signals into a single overview. In the meantime,
            use the dedicated sub-dashboards below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center mt-2">
            <Badge variant="secondary">Pending unified pipeline API</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Links to existing pipeline sub-dashboards */}
      <div className="grid gap-4 md:grid-cols-3">
        {PIPELINE_PAGES.map((page) => (
          <Link key={page.url} href={page.url}>
            <Card className="cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <page.icon className="h-5 w-5 text-muted-foreground" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-base mt-2">{page.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{page.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
