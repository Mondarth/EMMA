# Documentation

The documentation is built with [Sphinx](https://www.sphinx-doc.org/en/master/). Pages are written in Markdown using
[MyST](https://myst-parser.readthedocs.io/), which keeps Sphinx's directives and roles available, and use the
[furo](https://pradyunsg.me/furo/) theme.

All of the Python tooling lives in a Docker image built from `docs/Dockerfile`, with its dependencies pinned in
`docs/requirements.txt`. Nothing Python-related is installed on the host.

## Building

```sh
pnpm build:docs
```

This builds the image if necessary and writes the HTML to `docs/_build/html`. It is the same as running

```sh
docker compose run --rm --user "$(id -u):$(id -g)" docs make html
```

The guide to the browser extension shows its store screenshots, which are not kept in the repository: each release of
the extension takes them, and attaches them to its GitHub release (see {doc}`releases`). The documentation's own build
fetches the newest; to see them in a local build, fetch them first, with the GitHub CLI signed in:

```sh
scripts/docs/fetch-screenshots.sh
```

Without them, the build warns of each picture it cannot find, and goes on.

## Live preview

```sh
pnpm devserve:docs
```

This serves the documentation at <http://localhost:8000> and rebuilds and reloads it whenever a page changes. It is the
same as running

```sh
docker compose run --rm --service-ports --user "$(id -u):$(id -g)" docs make livehtml
```

## Updating the tooling

Change the pinned versions in `docs/requirements.txt` (or the base image in `docs/Dockerfile`) and rebuild the image:

```sh
docker compose build docs
```

Dependabot proposes these updates automatically.
