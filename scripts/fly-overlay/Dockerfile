# Production image as of 2026-10-17 (v182) + the Buffer/X publisher only.
FROM registry.fly.io/oddshunter-worker:deployment-01M54SQFM8Q05F8NT1PEX0VBCE
COPY src/worker/social/bufferPublisher.ts /app/src/worker/social/bufferPublisher.ts
COPY src/worker/telegram/consensusOutcomeResolver.ts /app/src/worker/telegram/consensusOutcomeResolver.ts
COPY src/worker/telegram/pickShare.ts /app/src/worker/telegram/pickShare.ts
RUN cd /app && npx tsx -e "Promise.all([import('./src/worker/social/bufferPublisher.ts'), import('./src/worker/telegram/pickShare.ts'), import('./src/worker/telegram/consensusOutcomeResolver.ts')]).then(() => console.log('modules ok'))"
