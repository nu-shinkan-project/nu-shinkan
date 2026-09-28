import { expect, it } from "vitest";
import { ConnectionGraph } from "./graph.js";
import { validateSources } from "./validation.js";

const graph = ConnectionGraph.fromJSON({
  packages: ["api", "web", "isolated"],
  edges: [["web", "api"]],
  reviewEntries: ["web"],
});

it.each(
  [[], ["api", "web"], ["isolated"], ["api", "api"]].map((sources) => ({
    sources,
  })),
)(
  "accepts registered sources, including empty, isolated and repeated names: %j",
  ({ sources }) => {
    expect(() => validateSources(graph, sources)).not.toThrow();
  },
);

it("rejects all unknown input names even when mixed with registered sources", () => {
  expect(() => validateSources(graph, ["missing", "api", "other"])).toThrow(
    "Unknown packages: missing, other",
  );
});
