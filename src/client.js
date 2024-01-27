const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../protos/book.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const bookCatalogProto = grpc.loadPackageDefinition(packageDefinition);

const client = new bookCatalogProto.BookCatalog('localhost:50000', grpc.credentials.createInsecure());

function listBooks() {
  const start = Date.now(); 
  client.ListBooks({}, (error, response) => {
    const duration = Date.now() - start; 

    if (!error) {
      console.log('List of Books:', JSON.stringify(response, null, 2));
    } else {
      console.error('Error:', error);
    }
    console.log(`Response time for ListBooks: ${duration}ms`);
  });
}

function getBookDetails(bookId) {
  const start = Date.now(); 
  client.GetBookDetails({ id: bookId }, (error, response) => {
    const duration = Date.now() - start; 

    if (!error) {
      console.log('Book Details:', JSON.stringify(response, null, 2));
    } else {
      console.error('Error:', error);
    }

    console.log(`Response time for GetBookDetails: ${duration}ms`);
  });
}

function deleteBook(bookId) {
  client.DeleteBook({ id: bookId }, (error, response) => {
      if (error) {
          console.error('Error:', error);
      } else {
          console.log(response.message);
      }
  });
}

// deleteBook(1); 

// listBooks();
// getBookDetails(10);


