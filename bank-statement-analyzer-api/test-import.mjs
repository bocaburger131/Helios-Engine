import('./src/app.js').then(() => {
  console.log('App imported successfully');
}).catch(err => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
});
