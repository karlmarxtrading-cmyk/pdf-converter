const trig = 'fixtures/rc6/user-trigonometry.md';
const mixed = 'fixtures/rc8/pdf/mixed-known-glyphs.md';
const conversation = 'fixtures/rc8/pdf/conversation.md';
export const cases = [];
for (const [t, template] of ['BUS-01','EDU-01','EDT-01','CON-01'].entries()) {
  for (const [s, paper] of ['A4','A5','Letter'].entries()) {
    for (const [o, orientation] of ['portrait','landscape'].entries()) {
      const index = (t + s + o) % 3;
      const fixture = t === 2 && s === 1 && o === 0 ? mixed : [trig,mixed,conversation][index];
      const topic = fixture === trig ? 'trigonometry' : fixture === mixed ? 'mixed-supported' : 'conversation';
      cases.push([topic+'-'+template+'-'+paper+'-'+orientation, fixture, template, paper, orientation]);
    }
  }
}
for (const [template,paper,orientation] of [['EDU-01','A4','portrait'], ['BUS-01','Letter','landscape'], ['EDT-01','A5','portrait']]) {
  cases.push(['mixed-original-'+template+'-'+paper+'-'+orientation,'fixtures/mixed-document.md',template,paper,orientation,'blocked']);
}
for (const [template,paper,orientation] of [['BUS-01','A4','portrait'],['EDU-01','A4','portrait'],['EDT-01','A5','portrait'],['CON-01','Letter','landscape']]) {
  const id = 'trigonometry-'+template+'-'+paper+'-'+orientation;
  if (!cases.some(c=>c[0]===id)) cases.push([id,trig,template,paper,orientation]);
}
