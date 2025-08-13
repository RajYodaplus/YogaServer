import { createServer } from 'node:http';
import { createSchema, createYoga } from 'graphql-yoga';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
// import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env variables
dotenv.config();

// Get Lambda directory from env
const lambdaDir = process.env.PYTHON_LAMBDA_DIR;
const graphqlDir = process.env.GRAPHQL_DIR;

if (!lambdaDir) {
  throw new Error("❌ Environment variable PYTHON_LAMBDA_DIR is not set in .env");
}
if (!graphqlDir) {
  throw new Error("❌ Environment variable GRAPHQL_DIR is not set in .env");
}

console.log('Lambda directory:', lambdaDir);
console.log('GraphQL directory:', graphqlDir);

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

const lambdaHandlerPath = path.resolve(lambdaDir, 'src/custom-query/handle_extend_drive.py');


// Load GraphQL schema from file
const typeDefs = fs.readFileSync(path.join(graphqlDir, 'custom-query/extendDrive.graphql'), 'utf8');

// Add AWS scalar definitions to the schema
const schemaWithScalars = `
  scalar AWSDateTime
  scalar AWSDate
  scalar AWSTime
  scalar AWSTimestamp
  scalar AWSEmail
  scalar AWSJSON
  scalar AWSURL
  scalar AWSPhone
  scalar AWSIPAddress
  
  # Add minimal Query type since GraphQL requires it
  type Query {
    _: Boolean
  }
  
  ${typeDefs}
`;

console.log('Schema content:', schemaWithScalars);

console.log('Lambda handler path:', lambdaHandlerPath);

// Define resolvers for the GraphQL schema
const resolvers = {
  Query: {
    _: () => true, // Dummy resolver for the minimal Query type
  },
  Mutation: {
    extendDrive: async (parent, { input }, context) => {
      console.log('\n=== GraphQL extendDrive Mutation Started ===');
      console.log('Input:', JSON.stringify(input, null, 2));
      
      try {
        // Call the Python Lambda with the mutation
        const result = await callPythonLambda({
          query: `mutation extendDrive($input: ExtendDriveInput!) {
            extendDrive(input: $input) {
              success
              updatedCount
              updatedDrvDetIds
              message
              errors
              updatedDrives {
                drvdetid
                drvname
                clientid
                policyruleid
                currentEndDate
                currentGracePeriod
                companyName
                status
              }
            }
          }`,
          variables: { input },
          operationName: 'extendDrive'
        });
        
        console.log('Lambda result:', JSON.stringify(result, null, 2));
        
        // Return the result from the Lambda
        if (result && result.data && result.data.extendDrive) {
          console.log('Returning Lambda result:', JSON.stringify(result.data.extendDrive, null, 2));
          return result.data.extendDrive;
        } else if (result && result.extendDrive) {
          console.log('Returning direct Lambda result:', JSON.stringify(result.extendDrive, null, 2));
          return result.extendDrive;
        } else {
          console.log('Returning full Lambda result:', JSON.stringify(result, null, 2));
          return result;
        }
      } catch (error) {
        console.error('extendDrive mutation error:', error);
        throw new Error(`Failed to extend drive: ${error.message}`);
      }
    }
  }
};

// Create the GraphQL schema with resolvers
const schema = createSchema({ typeDefs: schemaWithScalars, resolvers });

/**
 * Call Python Lambda script with GraphQL request payload as CLI argument
 */
function callPythonLambda(payload) {
  return new Promise((resolve, reject) => {
    const eventArg = JSON.stringify(payload);
    
    console.log('=== Python Lambda Call Started ===');
    console.log('Lambda handler path:', lambdaHandlerPath);
    console.log('Event argument:', eventArg);
    console.log('Environment variables:', Object.keys(process.env).filter(key => key.includes('DB') || key.includes('AWS')));

    const startTime = Date.now();
    
    execFile(
      'python3',
      [lambdaHandlerPath, eventArg],
      { 
        env: process.env, 
        maxBuffer: 1024 * 1024,
        cwd: lambdaDir // Set working directory to the Lambda directory where venv is located
      },
      (error, stdout, stderr) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`=== Python Lambda Call Completed (${duration}ms) ===`);
        
        if (error) {
          console.error('Lambda execution error:', error);
          console.error('Lambda stderr:', stderr);
          console.error('Lambda stdout:', stdout);
          return reject(error);
        }
        
        console.log('Lambda stdout length:', stdout.length);
        console.log('Lambda stdout:', stdout);
        
        if (stderr) {
          console.log('Lambda stderr length:', stderr.length);
          console.log('Lambda stderr:', stderr);
        }
        
        try {
          const result = JSON.parse(stdout);
          console.log('Successfully parsed Lambda result as JSON');
          console.log('Result type:', typeof result);
          console.log('Result keys:', result ? Object.keys(result) : 'null/undefined');
          resolve(result);
        } catch (err) {
          console.error('Failed to parse Lambda stdout as JSON');
          console.error('Parse error:', err.message);
          console.error('Raw stdout:', stdout);
          console.error('Stdout type:', typeof stdout);
          reject(err);
        }
      }
    );
  });
}

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/graphql',
});

const server = createServer(yoga);
server.listen(4000, () => {
  console.log('🚀 Yoga proxy running at http://localhost:4000/graphql');
});
