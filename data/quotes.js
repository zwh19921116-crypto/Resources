/* One original study quote for each calendar day, including February 29. */
(function () {
  const beginnings = [
    'Start with the next small step', 'A clear plan turns pressure into progress', 'Your future self notices the work you do today', 'Focus grows when you give it one task',
    'A difficult topic becomes lighter when you return to it', 'Good revision begins before you feel ready', 'Small wins make big goals believable', 'Questions are proof that learning is happening',
    'One focused page can change the rest of your session', 'Confidence is built in the quiet minutes of practice', 'Your notes become useful when you use them', 'Progress is often too small to notice until it adds up',
    'The best time to begin is the moment you choose one task', 'Every mistake can point to the next thing to learn', 'A calm routine is stronger than a burst of panic', 'You do not need perfect conditions to make progress',
    'Understanding grows when you slow down enough to connect ideas', 'Study time counts most when it has a purpose', 'The work you repeat becomes the skill you keep', 'One answer explained well is better than ten guessed quickly',
    'A revision plan gives your effort somewhere to go', 'Your attention is valuable; spend it on the next step', 'There is always one useful thing you can do in fifteen minutes', 'Strong results are built from ordinary study days',
    'A hard question is an invitation to think more carefully', 'Preparation gives confidence a place to grow', 'Your pace can be steady and still be powerful', 'Learning improves when you make room to reflect',
    'The goal is not to know everything at once', 'Every completed task makes the next one easier to start', 'Practice turns unfamiliar ideas into familiar territory', 'A focused session can reset an unproductive day',
    'Keep your plan simple enough to follow', 'The topics you avoid are often the ones that need one kind session', 'Revision works best when you test what you remember', 'You can build momentum from one honest attempt',
    'A checklist is a promise to your future self', 'The answer matters less than the thinking that found it', 'Your effort becomes visible through consistency', 'There is no wasted session when you learn from it',
    'The next question is always a fresh start', 'Study with curiosity and the details become easier to keep', 'A little preparation makes exam day less mysterious', 'Focus is a skill you can practice today',
    'Give difficult ideas more than one chance', 'A reliable routine can carry you through a busy week', 'Your learning deserves your full attention for a little while', 'Good habits are built from repeatable choices',
    'The calmest preparation is usually the most useful', 'Short sessions can create long-term confidence', 'Take the topic apart until it makes sense', 'You are allowed to begin before you feel certain',
    'Reviewing an error is how it becomes useful', 'Your next study session does not need to be extraordinary', 'A clear question is the start of a clear answer', 'Learning moves forward when you stay with the problem',
    'Every topic has a first step worth taking', 'Make today’s effort easy for tomorrow to continue', 'A focused mind can do a lot with a small block of time', 'The practice you do now makes the next challenge less intimidating',
    'You learn fastest when you are willing to check your understanding'
  ];

  const endings = [
    'and then keep going.', 'when you return to it tomorrow.', 'because consistency has a quiet kind of power.', 'one honest attempt at a time.', 'before the pressure has a chance to grow.', 'with patience, purpose and a pen in hand.'
  ];

  window.EDG_QUOTES = beginnings.flatMap((beginning) => endings.map((ending) => `${beginning} ${ending}`));
}());