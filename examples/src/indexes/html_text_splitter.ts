import { HtmlTextSplitter } from "langchain/text_splitter";

const text = `<!DOCTYPE html>
<html>
  <head>
    <title>🦜️🔗 LangChain</title>
    <style>
      body {
        font-family: Arial, sans-serif;
      }
      h1 {
        color: darkblue;
      }
    </style>
  </head>
  <body>
    <div>
      <h1>🦜️🔗 LangChain</h1>
      <p>⚡ Building applications with LLMs through composability ⚡</p>
    </div>
    <div>
      As an open source project in a rapidly developing field, we are extremely open to contributions.
    </div>
  </body>
</html>`;

const splitter = new HtmlTextSplitter({
  chunkSize: 175,
  chunkOverlap: 20,
});
const output = await splitter.createDocuments([text]);

console.log(output);

/*
  [
    Document {
      pageContent: '<!DOCTYPE html>\n<html>',
      metadata: { loc: [Object] }
    },
    Document {
      pageContent: '<title>🦜️🔗 LangChain</title>',
      metadata: { loc: [Object] }
    },
    Document {
      pageContent: 'body {\n' +
        '        font-family: Arial, sans-serif;\n' +
        '      }\n' +
        '      h1 {\n' +
        '        color: darkblue;\n' +
        '      }\n' +
        '    </style>\n' +
        '  </head>',
      metadata: { loc: [Object] }
    },
    Document {
      pageContent: '<div>\n' +
        '      <h1>🦜️🔗 LangChain</h1>\n' +
        '      <p>⚡ Building applications with LLMs through composability ⚡</p>\n' +
        '    </div>',
      metadata: { loc: [Object] }
    },
    Document {
      pageContent: 'As an open source project in a rapidly developing field, we are extremely open to contributions.\n' +
        '    </div>\n' +
        '  </body>\n' +
        '</html>',
      metadata: { loc: [Object] }
    }
  ]
*/
