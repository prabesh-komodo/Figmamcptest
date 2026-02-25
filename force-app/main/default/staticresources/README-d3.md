# D3.js static resource

The helloWorld node graph uses D3.js. Add the library as a static resource named **d3**:

1. Download D3 v7 (minified): https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js  
2. In Salesforce Setup → Static Resources → New: name = **d3**, file = the downloaded `d3.min.js`, Cache Control = Public.

Or via CLI (after downloading d3.min.js into this folder):
- Deploy the static resource so the name is exactly **d3** (the LWC references `@salesforce/resourceUrl/d3`).
