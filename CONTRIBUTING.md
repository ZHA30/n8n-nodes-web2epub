# Development

Use Node.js 24 or later and install dependencies with `npm ci`.

```sh
npm run lint
npm run build
npm run dev
```

## Release

Run `npm run release` from a clean, up-to-date `main` branch to select a version and push its release commit and tag.

The Publish workflow builds and publishes the tagged version to npm with provenance, then creates a GitHub release if one does not already exist.

npm Trusted Publishing must authorize `ZHA30/n8n-nodes-web2epub`, workflow `publish.yml`, without an environment restriction.

If publication needs retrying, run the Publish workflow manually with the existing version tag.
