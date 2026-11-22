// The current release's receipts, externally attached browser inputs and examples.
export const release = 'rc12';
export const evidence = 'evidence/' + release;
export const examples = 'examples/' + release;
export const acceptance = evidence + '/acceptance';
export const browserInputs = ['clipboard-source.html', 'mixed-formula.html', 'diagram.md']
  .map(name => evidence + '/browser/' + name);
export const referenceInputs = [
  'examples/rc7/ASSET-MANDIRI.pfproj',
  ...['trigonometry-BUS-A4','trigonometry-EDU-A4','trigonometry-EDT-A5','trigonometry-CON-Letter-landscape']
    .map(name=>'examples/rc7/pdf/'+name+'.pdf'),
];
