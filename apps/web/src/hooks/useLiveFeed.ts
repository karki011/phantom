/**
 * useLiveFeed Hook
 * Provides grouped, filtered feed events + activity summary + filter controls
 *
 * @author Subash Karki
 */
import { useAtom, useAtomValue } from 'jotai';

import {
  type ActivitySummary,
  type FeedEvent,
  type FeedFilter,
  type GroupedFeedEvent,
  activitySummaryAtom,
  feedFilterAtom,
  groupedFeedAtom,
  liveFeedAtom,
} from '../atoms/liveFeed';

interface UseLiveFeedReturn {
  events: FeedEvent[];
  grouped: GroupedFeedEvent[];
  summary: ActivitySummary;
  filter: FeedFilter;
  setFilter: (filter: FeedFilter) => void;
}

export const useLiveFeed = (): UseLiveFeedReturn => {
  const events = useAtomValue(liveFeedAtom);
  const grouped = useAtomValue(groupedFeedAtom);
  const summary = useAtomValue(activitySummaryAtom);
  const [filter, setFilter] = useAtom(feedFilterAtom);

  return { events, grouped, summary, filter, setFilter };
};
