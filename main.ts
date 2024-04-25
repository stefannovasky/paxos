import fetch from "node-fetch";
import express from "express";

type ProposeValue = {
  id: number;
  value: string | null;
};

type Propose = {
  data: ProposeValue;
};

type Node = { url: string };

const nodes: Node[] = [
  { url: 'http://paxos_3001:3001' },
  { url: 'http://paxos_3002:3002' },
  { url: 'http://paxos_3003:3003' }
];

const sendPostRequest = async <T>(url: string, bodyJson: string): Promise<T> => {
  const response = await fetch(url,
    { body: bodyJson, method: "POST", headers: { "Content-Type": "application/json" } });
  return response.json() as T;
}

class Proposer {
  private id: number = 0;

  public async prepare(proposeValue: string) {
    console.log(`[Proposer] starting preparation with value: ${proposeValue}`);
    this.id++;

    const prepareMessagesResponses: ProposeValue[] = [];
    const prepareMessageBody = JSON.stringify({ id: this.id });
    for (let node of nodes) {
      const url = `${node.url}/acceptor/handle-prepare-message`;
      console.log(`[Proposer] sending request to: ${url} with body: ${prepareMessageBody}`);
      const response = await sendPostRequest<ProposeValue>(url, prepareMessageBody);
      prepareMessagesResponses.push(response);
    }

    const majority = (nodes.length / 2) + 1;
    if (prepareMessagesResponses.length + 1 < majority) {
      throw new Error("didn't received a promise from the majority of acceptors. ");
    }

    let acceptedResponse = { id: 0, value: null } as ProposeValue;
    for (let prepareMessageResponse of prepareMessagesResponses) {
      if (prepareMessageResponse.id > acceptedResponse.id) {
        acceptedResponse = prepareMessageResponse;
      }
    }

    const acceptedValue = acceptedResponse?.value ?? proposeValue;
    console.log(`[Proposer] accepted prepare message with id: ${acceptedResponse.id} and value: ${acceptedResponse.value}`);

    const propose: Propose = { data: { id: this.id, value: acceptedValue } };

    const proposesResults: ProposeValue[] = [];
    const proposeMessageBody = JSON.stringify(propose);
    for (let node of nodes) {
      var url = `${node.url}/acceptor/handle-propose`;
      console.log(`[Proposer] sending request to ${url} with body: ${proposeMessageBody}`);;
      const response = await sendPostRequest<ProposeValue>(url, proposeMessageBody);
      proposesResults.push(response);
    }

    if ((proposesResults.length + 1) < majority) {
      throw new Error("value not accepted by the majority. ");
    }

    if (acceptedResponse.value !== null) {
      throw new Error("another value has already been accepted. ");
    }

    console.log(`value ${proposeValue} accepted successfully`);
  }
}

class Acceptor {
  private maxId: number = 0;
  private acceptedPropose: Propose | null = null;

  public prepare(prepareId: number): ProposeValue {
    console.log(`[Acceptor] starting preparation with id: ${prepareId}`)

    if (prepareId < this.maxId) {
      throw new Error("a proposal with a higher ID has already been accepted. ");
    }

    this.maxId = prepareId;

    if (this.acceptedPropose !== null) {
      const value = this.acceptedPropose.data.value;
      console.log(`[Acceptor] finishing preparation with id: ${prepareId} and value: ${value}`);
      return { id: prepareId, value: value };
    }

    console.log(`[Acceptor] finishing preparation with id: ${prepareId} and value: null`);
    return { id: prepareId, value: null };
  }

  public propose(propose: Propose): ProposeValue {
    console.log(`[Acceptor] starting proposal with id: ${propose.data.id} and value: ${propose.data.value}`);

    if (this.maxId != propose.data.id) {
      throw new Error("cannot accept proposal with a lower id. ");
    }

    this.acceptedPropose = propose;
    console.log(`[Acceptor] finishing proposal with id: ${propose.data.id} and value: ${propose.data.value}`);

    return propose.data;
  }
}

const proposer = new Proposer();
const acceptor = new Acceptor();

const app = express();
app.use(express.json());

app.post("/proposer", async (req, res) => {
  console.log(`[${req.url}] with body: ${JSON.stringify(req.body)}`);
  await proposer.prepare(req.body.value);
  console.log(`[${req.url}] with body: ${JSON.stringify(req.body)} accepted`);
  return res.status(200).send("Ok");
});

app.post("/acceptor/handle-prepare-message", (req, res) => {
  console.log(`[${req.url}] with body: ${JSON.stringify(req.body)}`);
  const result = acceptor.prepare(req.body.id);
  console.log(`[${req.url}] with body returning: ${JSON.stringify(result)}`);
  return res.status(200).json(result);
});

app.post("/acceptor/handle-propose", (req, res) => {
  console.log(`[${req.url}] with body: ${JSON.stringify(req.body)}`);
  const result = acceptor.propose(req.body);
  console.log(`[${req.url}] with body ${JSON.stringify(req.body)} returning: ${JSON.stringify(result)}`);
  return res.status(200).json(result);
});

const port = process.env.PORT;

app.listen(port, () => console.log(`running on port: ${port}`));
