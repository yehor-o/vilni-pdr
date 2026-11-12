/** Shape of public/data/questions.b.json (built by scripts/build_data.py). */
export interface Question {
  /** Stable id, e.g. "8.1-6". */
  id: string;
  /** Official number inside the topic. */
  n: number;
  text: string;
  options: string[];
  /** 0-based index into `options`. */
  correct: number;
  /** File names inside public/img/. */
  images: string[];
  /** Captions under the images, same order (rare). */
  imageCaptions?: string[];
}

export interface Topic {
  id: string;
  /** Official UPPERCASE title. */
  title: string;
  questions: Question[];
}

export interface QuestionBank {
  order: string;
  category: string;
  topics: Topic[];
}
