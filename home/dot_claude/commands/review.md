For all file in docs/current/ and docs/review/, spawn sub-agents in parallel, using the Task tool.

The task of each agent is to read the spec and find any violations in implementation, then write a markdown report under docs/issues/

The report should include:

- The referenced spec file
- The file path and line numbers of the violating code
- Brief explanation of the violation

Taret implementation files: $ARGUMENTS

