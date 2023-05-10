## simple paxos algorithm implementation 

### how to run 
```
docker compose up 
```

send a propose
```
curl --request POST \
  --url http://localhost:3001/proposer \
  --header 'Content-Type: application/json' \
  --data '{ "value": 1 }'  
```

### references 
- https://people.cs.rutgers.edu/~pxk/417/notes/paxos.html