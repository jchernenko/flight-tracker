import type { Status } from '../features/aircraft/status';

type Props = { status: Status; feed: string | undefined };

/** One line on how fresh the picture is: a dot and a few words. */
export function StatusLine({ status, feed }: Props) {
  const feedName = feed ?? 'the feed';
  const { kind, time } = status;
  const text = {
    acquiring: `Connecting to ${feedName}`,
    live: `Live · updated ${time}`,
    stale: `Stale · last update ${time} · retrying`,
    offline: 'Feed offline · retrying',
  }[kind];
  const dot =
    kind === 'live'
      ? 'bg-text'
      : kind === 'offline'
        ? 'bg-alert'
        : 'border-[1.5px] border-muted bg-transparent';
  return (
    <p
      role="status"
      className={`flex items-center gap-2 text-[13px] ${kind === 'offline' ? 'text-alert' : 'text-text2'}`}
    >
      <span className={`size-[7px] shrink-0 rounded-full ${dot}`} />
      {text}
    </p>
  );
}
