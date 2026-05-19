# Repomix Output: mixed languages

================
File: src/api.ts
================
```typescript
import { request } from 'node:http';
export async function fetchUser(id: string) { return id; }
```

================
File: scripts/build.py
================
```python
from pathlib import Path
import os, sys
import json as j

def main():
    return 0

class Builder:
    def __init__(self):
        pass

def _private():
    pass
```

================
File: cmd/server.go
================
```go
package main

import (
    "fmt"
    "net/http"
    alias "encoding/json"
)

type Server struct {}
type unexported struct {}

func (s *Server) Run() error {
    fmt.Println("running")
    return nil
}

func privateHelper() {}
```

================
File: README.md
================
```markdown
# Project

Just docs.
```
