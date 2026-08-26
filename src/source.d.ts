export interface ListItem {
  link?: string;
  articleUrl?: string;
  title?: string;
  date?: string | Date;
  content?: string;
}

export interface Article {
  title?: string;
  content: string;
  date?: string | Date;
}

export interface Source {
  id: string;
  title: string;
  link: string;
  description: string;
  encoding?: string;
  concurrency?: number;
  extractItems?(document: Document): ListItem[];
  fetchItems?(): Promise<ListItem[]>;
  extract?(
    document: Document,
    url: string,
  ): Article | null | Promise<Article | null>;
}
