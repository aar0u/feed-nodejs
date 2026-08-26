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
  buildChangeEntries?(
    capturedContent: CapturedContent,
    candidate: FeedEntryCandidate,
    history: EntryHistory,
  ): FeedEntry[];
  extractItems?(document: Document): FeedEntryCandidate[];
  fetchItems?(): Promise<FeedEntryCandidate[]>;
  extract?(
    document: Document,
    url: string,
  ): CapturedContent | null | Promise<CapturedContent | null>;
}
