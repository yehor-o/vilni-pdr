/** Shape of public/data/questions.json (built by scripts/build_data.py). */
export interface Question {
  /** Stable id, e.g. "8.1-6". Unique across all categories. */
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
  /** Exam block the topic's questions are drawn for (`ExamBlock.id`). */
  block: string;
  questions: Question[];
}

/** Part of the exam: `count` questions are drawn from the topics of this block. */
export interface ExamBlock {
  id: string;
  title: string;
  count: number;
}

export interface CategoryInfo {
  /** "A" | "B" | "C" | "D" | "T". */
  id: string;
  /** Display title, e.g. "B1, B". */
  title: string;
  /** Topics of this category, in official order. */
  topicIds: string[];
}

/** The whole data file: every category, shared topics stored once. */
export interface QuestionData {
  order: string;
  examBlocks: ExamBlock[];
  categories: CategoryInfo[];
  topics: Topic[];
}

/** The question bank of one category (what the screens work with). */
export interface QuestionBank {
  order: string;
  /** Category id, e.g. "B". */
  category: string;
  /** Category display title, e.g. "B1, B". */
  categoryTitle: string;
  examBlocks: ExamBlock[];
  topics: Topic[];
}
