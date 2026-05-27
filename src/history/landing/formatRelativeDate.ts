export function formatRelativeDate(iso?: string, now = new Date()): string {
	if (!iso) {
		return '';
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return '';
	}

	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayDiff = Math.round(
		(startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000)
	);

	if (dayDiff === 0) {
		return 'Today';
	}
	if (dayDiff === 1) {
		return 'Yesterday';
	}
	if (dayDiff > 1 && dayDiff < 7) {
		return `${dayDiff} days ago`;
	}

	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric'
	});
}
