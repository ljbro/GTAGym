# Online play and per-task links

One deployment serves all 150 benchmark tasks. A task link has the form:

```text
https://ljbro.github.io/GTAGym/?task=c01-n01
https://ljbro.github.io/GTAGym/?task=c10-n01
https://ljbro.github.io/GTAGym/?task=c11-n01
```

The game loads, selects the task and category, and opens the instruction menu.
The user presses **Start task** when ready. Loading and reading the instruction
do not consume the task budget. URLs without `task` preserve the normal game
entry; unknown IDs open the picker with a notice instead of starting another
task. A GitHub project subdirectory is supported, for example
`https://ljbro.github.io/GTAGym/?task=c01-n01`.

Browse all 150 links on the [task directory](https://ljbro.github.io/GTAGym/tasks.html)
or in [task-links.md](task-links.md).

## GitHub Pages

1. Push the repository, including `.github/workflows/pages.yml`.
2. In the repository's **Settings > Pages**, choose **GitHub Actions** as the
   source. Private repositories require a GitHub plan supporting Pages; the
   deployment does not change repository visibility.
3. Run **Deploy playable tasks** from **Actions**.
4. Open the deployment URL. `tasks.html` contains all 150 links and their
   complete English instructions; `TASKS.md` provides a Markdown copy.

The workflow runs when game or deployment files are pushed to `main`, and it
can also be triggered manually. It builds the game and packages only the
runtime directories, compiled entry point, and task index. Credentials,
evaluation results, local configurations, dashboards, and dataset exports are
not published. Rendering runs in the visitor's browser and uses their device.

## Build a static deployment locally

```bash
npm ci
npm run build
node scripts/build-site.mjs --base-url https://ljbro.github.io/GTAGym/
```

The output is `dist/site/`, ready for static hosting. The build refuses an
existing output directory and verifies that the package fits within the 1 GiB
GitHub Pages site limit. Use `--output .cache/site-preview` for a separate local
package. The generated task URLs share one set of models, textures, and task
assets; the game is not copied 150 times.

The original [GTA_SZ](https://github.com/linranff/GTA_SZ) demo uses Cloudflare
Workers for small files and R2 for large runtime assets. That architecture is
also compatible with these task URLs; `dist/site/` is a host-neutral static
package. See the upstream deployment documentation for the Workers/R2 setup.
