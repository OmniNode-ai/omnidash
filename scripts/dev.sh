#!/usr/bin/env bash
# Source the platform env file before starting any Node.js process.
# This aligns omnidash local startup with the Python-repo env model:
# both use ~/.omnibase/.env as the platform config source of truth.
# The mechanism differs (explicit source vs. shell-session inheritance)
# but the source is identical.
#
# Cloud: ~/.omnibase/.env does not exist in containers.
# K8s env vars injected by the Infisical operator are already present —
# this script is a no-op in that context.

OMNIBASE_ENV="${HOME}/.omnibase/.env"

# Snapshot caller-set bus vars BEFORE sourcing the platform env.
# This preserves explicit bus mode set by npm run dev:local / dev:cloud.
_CALLER_KAFKA_BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-}"
_CALLER_BUS_MODE="${OMNIDASH_BUS_MODE:-}"

if [ -f "${OMNIBASE_ENV}" ]; then
    # shellcheck source=/dev/null
    set -a
    source "${OMNIBASE_ENV}"
    set +a
fi

# Restore if explicitly set by caller — prevents ~/.omnibase/.env from
# silently overriding the intended bus when running dev:local or dev:cloud.
if [ -n "${_CALLER_BUS_MODE}" ]; then
    export OMNIDASH_BUS_MODE="${_CALLER_BUS_MODE}"
    if [ -n "${_CALLER_KAFKA_BOOTSTRAP_SERVERS}" ]; then
        export KAFKA_BOOTSTRAP_SERVERS="${_CALLER_KAFKA_BOOTSTRAP_SERVERS}"
    fi
fi

exec "$@"
