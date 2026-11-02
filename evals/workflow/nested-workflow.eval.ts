import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./nested-workflow.cases.js";

describeWorkflow("nested", () => runWorkflowCases(cases));
