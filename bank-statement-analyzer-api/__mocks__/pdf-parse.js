const pdfParseMock = (dataBuffer, options = {}) => {
  return Promise.resolve({
    text: 'Mocked PDF content from root mock',
    numpages: 1,
    info: {
      Author: 'Test Author',
      CreationDate: 'D:20220101000000',
      Creator: 'Mock Creator',
      ModDate: 'D:20220101000000',
      Producer: 'Mock Producer',
      Title: 'Mock Title'
    },
    metadata: null,
    version: '1.10.100'
  });
};

module.exports = pdfParseMock;
module.exports.default = pdfParseMock;