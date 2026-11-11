import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		files: ['package.json'],
		rules: {
			// Self-hosted package: DOM parsing and native image conversion are runtime dependencies.
			'@n8n/community-nodes/no-runtime-dependencies': 'off',
		},
	},
];
