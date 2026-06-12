import('./test-minimal-service.js')
  .then((module) => {
    console.log('Minimal module loaded:', module);
    console.log('Has default?', !!module.default);
    if (module.default) {
      console.log('Default keys:', Object.keys(module.default));
      console.log('Has calculateVeritasScore?', typeof module.default.calculateVeritasScore);
    }
  })
  .catch((error) => {
    console.error('Import error:', error);
  });
