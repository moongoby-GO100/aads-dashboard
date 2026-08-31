# AADS Dashboard Agent Rules

Read and obey `/root/aads/AGENTS.md` before changing or deploying this repository.

For every dashboard release, `deploy.sh` must enforce: one image build per release SHA, `--no-build` candidate/standby starts, candidate health before the nginx lock, same-digest standby synchronization, viewport-safe version refresh, rollback on external-health failure, and five-minute P0/P1 monitoring before completion is reported.

Never overwrite unrelated dirty files, hold the shared nginx lock during image builds, rebuild the standby image, deploy the full compose stack for an app change, or use `git commit --no-verify`.
