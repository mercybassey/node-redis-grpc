const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const path = require('path');

const redisClient = require('../redis');

const PROTO_PATH = path.join(__dirname, '../protos/book.proto');
const BOOKS_JSON_PATH = path.join(__dirname, './books.json');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true });
const bookCatalogProto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();

const CACHE_TTL = 90; 

server.addService(bookCatalogProto.BookCatalog.service, {
  ListBooks: listBooks,
  GetBookDetails: getBookDetails,
  DeleteBook: deleteBook,
});

server.bindAsync('0.0.0.0:50000', grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Error binding server:', err);
    throw err;
  }
  console.log(`Server bound at http://0.0.0.0:${port}`);
  server.start();
});

async function readAndCacheBooks() {
  console.log('Fetching books from file');
  try {
      const booksData = fs.readFileSync(BOOKS_JSON_PATH, 'utf-8');
      const books = JSON.parse(booksData);
      await redisClient.SETEX('books', CACHE_TTL, JSON.stringify(books));
      for (const book of books) {
        await redisClient.SETEX(`bookDetails:${book.id}`, CACHE_TTL,JSON.stringify(book));
      }
      return books;
  } catch (err) {
      console.error('Error reading or parsing books file:', err);
      throw err;
  }
}


async function retrieveBooksFromFile(callback) {
  const cachedBooks = await redisClient.get('books');
  if (cachedBooks) {
    console.log('Books found in cache');
    return callback(null, JSON.parse(cachedBooks));
  } else {
    const books = await readAndCacheBooks();
    callback(null, books);
  }
}


async function retrieveBookDetailsFromFile(bookId, callback) {
  const cachedDetails = await redisClient.get(`bookDetails:${bookId}`);
  if (cachedDetails) {
    console.log(`Details for book ID: ${bookId} found in cache`);
    return callback(null, JSON.parse(cachedDetails));
  }

  console.log(`Fetching details for book ID: ${bookId} from file`);
  let books;
  const cachedBooks = await redisClient.get('books');
  if (cachedBooks) {
    books = JSON.parse(cachedBooks);
  } else {
    books = await readAndCacheBooks();
  }
  const bookDetails = books.find(book => book.id === Number(bookId));
  if (bookDetails) {
    const response = {
      isbn: bookDetails.isbn,
      genre: bookDetails.genre,
      description: bookDetails.description
    };
    await redisClient.set(`bookDetails:${bookId}`, JSON.stringify(response));
    callback(null, response);
  } else {
    console.log(`Book ID: ${bookId} not found in file`);
    callback({ code: grpc.status.NOT_FOUND, details: 'Book not found' });
  }
}



function listBooks(_, callback) {
  retrieveBooksFromFile((err, books) => {
    if (err) {
      callback({ code: grpc.status.INTERNAL, details: 'Error listing books' });
    } else {
      const response = {
        total_books: books.length.toString(),
        book_info: books.map(book => ({
          id: book.id,
          title: book.title,
          author: book.author,
          publication_year: book.publication_year
        }))
      };
      callback(null, response);
    }
  });
}

function getBookDetails(call, callback) {
  const { id } = call.request;
  retrieveBookDetailsFromFile(id, (err, bookDetails) => {
    if (err) {
      callback({ code: grpc.status.INTERNAL, details: 'Error getting book details' });
    } else {
      callback(null, bookDetails);
    }
  });
}



async function deleteBook(call, callback) {
  const bookId = call.request.id;

  try {
    const booksData = fs.readFileSync(BOOKS_JSON_PATH, 'utf-8');
    let books = JSON.parse(booksData);
    const bookIndex = books.findIndex(book => book.id === bookId);
    if (bookIndex === -1) {
      return callback({
        code: grpc.status.NOT_FOUND,
        details: 'Book not found'
      });
    }

    books.splice(bookIndex, 1);
    fs.writeFileSync(BOOKS_JSON_PATH, JSON.stringify(books, null, 2));

    await redisClient.del(`bookDetails:${bookId}`);

    await redisClient.del('books');

    callback(null, { message: 'Book deleted successfully' });
  } catch (err) {
    console.error('Error processing delete request:', err);
    callback({
      code: grpc.status.INTERNAL,
      details: 'Failed to delete the book'
    });
  }
}

