const QUOTES = [
  '"The best way to predict the future is to invent it." – Alan Kay',
  '"Simplicity is prerequisite for reliability." – Edsger W. Dijkstra',
  '"Talk is cheap. Show me the code." – Linus Torvalds',
  '"Any fool can write code that a computer can understand. Good programmers write code that humans can understand." – Martin Fowler',
  '"First solve the problem, then write the code." – John Johnson',
  '"Code is like humor. When you have to explain it, it\'s bad." – Cory House',
  '"Make it work, make it right, make it fast." – Kent Beck',
  '"Debugging is twice as hard as writing the code in the first place." – Brian Kernighan'
];

function getRandomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

export const commands = [
  {
    name: '/qotd',
    aliases: ['/quote'],
    description: 'Show a random programming quote of the day',
    run() {
      console.log(`\n  💡 ${getRandomQuote()}\n`);
    }
  }
];

export const tools = [];

export function init(ctx) {
  // No init needed for this simple plugin
}
