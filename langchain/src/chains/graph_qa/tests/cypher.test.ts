/* eslint-disable no-process-env */

import { GraphCypherQAChain } from "../cypher.js";
import { Neo4jGraph } from "../../../graphs/neo4j_graph.js";
import { OpenAI } from "../../../llms/openai.js";

describe("testCypherGeneratingRun", () => {
  it("should generate and execute Cypher statement correctly", async () => {
    const url = process.env.NEO4J_URI as string;
    const username = process.env.NEO4J_USERNAME as string;
    const password = process.env.NEO4J_PASSWORD as string;

    expect(url).toBeDefined();
    expect(username).toBeDefined();
    expect(password).toBeDefined();

    const graph = await Neo4jGraph.initialize({ url, username, password });
    const model = new OpenAI({ temperature: 0 });

    // Delete all nodes in the graph
    await graph.query("MATCH (n) DETACH DELETE n");

    // Create two nodes and a relationship
    await graph.query(
      "CREATE (a:Actor {name:'Bruce Willis'})" +
        "-[:ACTED_IN]->(:Movie {title: 'Pulp Fiction'})"
    );

    await graph.refreshSchema();

    const chain = GraphCypherQAChain.fromLLM({
      llm: model,
      graph,
    });

    const output = await chain.run("Who played in Pulp Fiction?");
    const expectedOutput = " Bruce Willis played in Pulp Fiction.";
    expect(output).toEqual(expectedOutput);
  });
});
