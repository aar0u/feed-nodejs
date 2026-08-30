export interface FeedEntryCandidate {
  link?: string;
  contentUrl?: string;
  title?: string;
  date?: string | Date;
  content?: string;
}

export interface CapturedContent {
  title?: string;
  content: string;
  date?: string | Date;
  changeCandidates?: FeedEntry[];
}

export interface FeedEntry {
  id: string;
  title: string;
  link: string;
  content: string;
  date?: string | Date;
}

export interface EntryHistory {
  contents: string[];
}

export interface Source {
  id: string;
  title: string;
  link: string;
  description: string;
  encoding?: string;
  contentFetchConcurrency?: number;
  requestDelay?: number;
  changeBatchSize?: number;
  changeBatchDelay?: number;
  filterChangeCandidates?(
    capturedContent: CapturedContent,
    history: EntryHistory,
  ): FeedEntry[];
  buildChangeEntries?(
    capturedContent: CapturedContent,
    candidate: FeedEntryCandidate,
    changeCandidates: FeedEntry[],
  ): FeedEntry[];
  extractItems?(document: Document): FeedEntryCandidate[];
  fetchItems?(): Promise<FeedEntryCandidate[]>;
  fetchContent?(
    candidate: FeedEntryCandidate,
  ): CapturedContent | null | Promise<CapturedContent | null>;
  extract?(
    document: Document,
    url: string,
  ): CapturedContent | null | Promise<CapturedContent | null>;
}
