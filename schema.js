import { createSchema } from "graphql-yoga";
import { execFile } from "child_process";
import path from "path";
import { GraphQLScalarType, Kind } from "graphql";
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';


// Add scalar definitions here
const scalarTypeDefs = `
  scalar AWSDate
  scalar AWSDateTime
`;

const typeDefsArray = [
  scalarTypeDefs,
  ...loadFilesSync('/home/raj/Desktop/ehb-backend/graphql/types/custom-query/**/*.graphql')
];
const typeDefs = mergeTypeDefs(typeDefsArray);

const pythonScript = path.resolve(
  "/home/raj/Desktop/ehb-backend/src/custom-query/handle_extend_drive.py"
);

// Generalized resolver
function pythonResolver(fieldName) {
  return async (_, args) => {
    return new Promise((resolve, reject) => {

    console.log("Python args: ", args)
      execFile(
        "/home/raj/Desktop/ehb-backend/venv/bin/python3",
        [pythonScript, JSON.stringify({ fieldName, arguments: args })],
        (error, stdout, stderr) => {
          if (error) {
            console.error("Python stderr:", stderr);
            console.error("Python execution failed:", error.message);
            return reject(new Error(`Python execution failed: ${error.message}`));
          }
          try {
            // Extract JSON from the last line of stdout (in case there are debug prints)
            console.log(stdout)
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            // console.log("Last line: ", lastLine)
            resolve(JSON.parse(lastLine));
          } catch (e) {
            console.error("JSON parse error:", e.message);
            // console.error("Full Python stdout:", stdout);
            console.error("Python stderr:", stderr);
            reject(new Error(`Failed to parse Python response: ${e.message}. Check Python handler for Decimal serialization issues.`));
          }
        }
      );
    });
  };
}

// Dynamically generate resolvers for all Query and Mutation fields
const queryFields = [
//   "getPolicyEnrollmentsForEmployee"
];
const mutationFields = [
    "extendDrive"
];

const Query = {};
for (const field of queryFields) {
  Query[field] = pythonResolver(field);
}
const Mutation = {};
for (const field of mutationFields) {
  Mutation[field] = pythonResolver(field);
}

// Scalars
const AWSDate = new GraphQLScalarType({
  name: "AWSDate",
  description: "The AWSDate scalar type represents a valid date string (YYYY-MM-DD).",
  serialize(value) {
    return value instanceof Date ? value.toISOString().split("T")[0] : value;
  },
  parseValue(value) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

const AWSDateTime = new GraphQLScalarType({
  name: "AWSDateTime",
  description: "The AWSDateTime scalar type represents a valid date-time string (YYYY-MM-DDTHH:mm:ss.sssZ).",
  serialize(value) {
    return value instanceof Date ? value.toISOString() : value;
  },
  parseValue(value) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

export const schema = createSchema({
  typeDefs,
  resolvers: {
    AWSDate,
    AWSDateTime,
    Query,  
    Mutation,
  },
});