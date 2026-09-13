# AADS Dashboard Agent Rules

Read and obey `/root/aads/AGENTS.md` before changing or deploying this repository.

For every dashboard release, `deploy.sh` must enforce: one image build per release SHA, `--no-build` candidate/standby starts, candidate health before the nginx lock, same-digest standby synchronization, viewport-safe version refresh, rollback on external-health failure, and five-minute P0/P1 monitoring before completion is reported.

Never overwrite unrelated dirty files, hold the shared nginx lock during image builds, rebuild the standby image, deploy the full compose stack for an app change, or use `git commit --no-verify`.

## Observed failures (2026-09-13)

These are not hypothetical. All three came from ignoring the rules above.

**`docker compose build` does not deploy this app.** It tags `aads-dashboard:local`,
but the running containers use the release SHA tag (`aads-dashboard:<sha>`). A build
can succeed while production keeps serving the previous image — and nothing reports
an error. The source fix was present in the commit, on disk, and in the build context;
only the served bundle was stale, and that was only discovered by extracting the image
and grepping the chunks. Use `bash deploy.sh`.

**Do not build the same image while a release is running.** BuildKit shares identical
build steps between concurrent builds, so cancelling one cancels the other. A parallel
`docker compose build`, then killing it to "clean up", took the official deploy down
with it (`deploy_runs` #414, `context canceled`). This is what "one image build per
release SHA" protects against.

**`nohup` is not enough to detach a deploy.** Two restarts died as `context canceled`
when the launching shell went away; the docker client disconnecting cancels the build.
Launch it so it survives the caller, and verify the run reached `success` in
`deploy_runs` rather than assuming.
