export async function mapConcurrent<T, R>(
	values: readonly T[],
	concurrency: number,
	process: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
	const result: R[] = new Array(values.length);
	let next = 0;
	let stopped = false;
	const workers = Array.from(
		{ length: Math.min(concurrency, values.length) },
		async () => {
			while (!stopped && next < values.length) {
				const index = next++;
				try {
					result[index] = await process(values[index], index);
				} catch (error) {
					stopped = true;
					// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- The node execution boundary wraps errors with item context.
					throw error;
				}
			}
		},
	);
	const settled = await Promise.allSettled(workers);
	const failure = settled.find((entry) => entry.status === 'rejected');
	if (failure?.status === 'rejected') throw failure.reason;
	return result;
}
