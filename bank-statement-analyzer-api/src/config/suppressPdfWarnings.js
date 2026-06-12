const PDF_OBJECT_INDEXING_WARNING = 'Indexing all PDF objects';

const shouldSuppressPdfWarning = (values) =>
  values.some((value) => String(value).includes(PDF_OBJECT_INDEXING_WARNING));

const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
  if (shouldSuppressPdfWarning(args)) return;
  originalConsoleWarn(...args);
};

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  if (shouldSuppressPdfWarning(args)) return;
  originalConsoleError(...args);
};

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const warningValues = [
    warning,
    ...args,
    typeof warning === 'object' && warning !== null ? warning.message : ''
  ];

  if (shouldSuppressPdfWarning(warningValues)) return;
  return originalEmitWarning(warning, ...args);
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  if (String(chunk).includes(PDF_OBJECT_INDEXING_WARNING)) return true;
  return originalStderrWrite(chunk, ...args);
};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...args) => {
  if (String(chunk).includes(PDF_OBJECT_INDEXING_WARNING)) return true;
  return originalStdoutWrite(chunk, ...args);
};
