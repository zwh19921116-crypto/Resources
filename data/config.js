/**
 * SITE VOCABULARY — the lists the whole site is built from.
 * Add a new resource type / subject / year level here and it appears
 * everywhere automatically: category cards, filters, badges, admin dropdowns.
 */
window.EDG_CONFIG = {

  // How many cards to show before the "Load more" button.
  pageSize: 8,

  /**
   * Resource types.
   * key       - never change once used; entries refer to it
   * label     - what visitors see on the badge and category card
   * blurb     - description on the category card
   * colour    - purple | blue | green | teal | amber | pink | red | indigo
   * icon      - id from the icon sprite in index.html (i-<icon>)
   * action    - 'link'  opens the url in a new tab
   *             'embed' opens a video popup on the page
   */
  types: {
    'practice-questions': {
      label: 'Practice Questions',
      blurb: 'Topic based questions to build skills and confidence.',
      colour: 'purple', icon: 'question', action: 'link'
    },
    'practice-exam': {
      label: 'Practice Exam',
      blurb: 'Realistic exams to test your knowledge.',
      colour: 'blue', icon: 'doc', action: 'link'
    },
    'checklist': {
      label: 'Subject Checklist',
      blurb: 'Track your learning and stay on top of key topics.',
      colour: 'green', icon: 'checklist', action: 'link'
    },
    'knowledge-sheet': {
      label: 'Knowledge Sheet',
      blurb: 'Concise notes and summary sheets for quick revision.',
      colour: 'amber', icon: 'book', action: 'link'
    },
    'interactive-app': {
      label: 'Interactive App',
      blurb: 'Engaging tools and games that make learning fun.',
      colour: 'pink', icon: 'tap', action: 'link'
    },
    'video': {
      label: 'Video',
      blurb: 'Watch concepts explained step by step.',
      colour: 'red', icon: 'play', action: 'embed'
    }
    // To add a new type later, copy a block above and give it a new key, e.g.
    // 'ai-tool': { label: 'AI Tool', blurb: '...', colour: 'indigo', icon: 'spark', action: 'link' }
  },

  categoryArt: {
    'practice-questions': 'questions',
    'practice-exam': 'examCard',
    checklist: 'checklistCard',
    'knowledge-sheet': 'knowledge',
    'interactive-app': 'interactive',
    video: 'videoCard'
  },

  subjects: ['Maths', 'Biology', 'Chemistry', 'Physics', 'English'],

  educationStages: {
    primary: { label: 'Primary' },
    secondary: { label: 'Secondary' },
    vce: { label: 'VCE' }
  },

  years: ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'VCE Units 1&2', 'VCE Units 3&4'],

  vceUnits: ['VCE Units 1&2', 'VCE Units 3&4'],

  yearsByStage: {
    primary: [],
    secondary: ['Year 7', 'Year 8', 'Year 9', 'Year 10'],
    vce: ['VCE Units 1&2', 'VCE Units 3&4']
  },

  levels: ['Easy', 'Medium', 'Hard', 'Reference', 'Fun'],

  levelsByStage: {
    primary: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
  },

  estimatedMinutes: [10, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345, 360, 375, 390, 405, 420, 435, 450, 465, 480],

  // Thumbnail illustrations available to choose from.
  artStyles: ['maths', 'biology', 'chemistry', 'physics', 'english', 'exam', 'leaf', 'space', 'video', 'checklist']
};
