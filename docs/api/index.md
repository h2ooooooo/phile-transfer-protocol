# API documentation

The public integration protocol is an authenticated HTTP API. The local Node.js component is a CLI, not an embeddable JavaScript SDK. Use the host language's HTTP library; the Node.js examples use built-in `fetch`.

- **Getting started:** [run a complete directory-listing example](../examples/api-list).
- **Common tasks:** [list, read and write requests](./tasks).
- **Reference:** [actions, response shapes and errors](../reference/api).
- **Advanced:** [verified upload sessions](../advanced/transfers), [permissions and credentials](../advanced/security).
- **PHP integration:** [Composer entry point with `Server::run()`](../server/composer).

The standalone endpoint and WordPress endpoint use the same transfer operations, with different authentication and error envelopes. Match the chosen endpoint's documented response shape.
