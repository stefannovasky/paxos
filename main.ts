import fetch from "node-fetch";
import express from "express";

type Value = {
    id: number;
    value: string | null;
};

type Propose = {
    data: Value;
};

const nodes: { url: string }[] = [{ url: 'http://paxos_3001:3001' }, { url: 'http://paxos_3002:3002' }, { url: 'http://paxos_3003:3003' }];

const sendPostRequest = async <T>(url: string, bodyJson: string): Promise<T> => {
    const response = await fetch(url,
        { body: bodyJson, method: "POST", headers: { "Content-Type": "application/json" } });
    return await response.json() as T;
}

class Proposer {
    private id: number = 0;

    public async prepare(proposeValue: string) {
        console.log(`[Proposer] starting propose prepare with value: ${proposeValue}`);
        this.id++;

        const prepareMessagesResponses: Value[] = [];
        for (let node of nodes) {
            const body = JSON.stringify({ id: this.id });
            console.log(`[Proposer] sending request to: ${node.url}/acceptor/handle-prepare-message with body: ${body}`);
            const response = await sendPostRequest<Value>(`${node.url}/acceptor/handle-prepare-message`, body);
            prepareMessagesResponses.push(response);
        }

        const majority = (nodes.length / 2) + 1;
        if (prepareMessagesResponses.length + 1 < majority) {
            throw new Error("didn't received promise from majority of acceptors. ");
        }

        let acceptedResponse = { id: 0, value: null } as Value;
        for (let prepareMessageResponse of prepareMessagesResponses) {
            if (prepareMessageResponse.id > acceptedResponse.id) {
                acceptedResponse = prepareMessageResponse;
            }
        }

        const acceptedValue = acceptedResponse === null ? (acceptedResponse as Value).value : proposeValue;
        console.log(`[Proposer] accepted prepare message with id: ${acceptedResponse.id} and value: ${acceptedResponse.value}`);

        const propose: Propose = { data: { id: this.id, value: acceptedValue } };

        const proposesResults: Value[] = [];
        for (let node of nodes) {
            const body = JSON.stringify(propose);
            console.log(`[Proposer] sending request to ${node.url}/acceptor/handle-propose with body: ${body}`);
            const response = await sendPostRequest<Value>(`${node.url}/acceptor/handle-propose`, body);
            proposesResults.push(response);
        }

        if ((proposesResults.length + 1) < majority) {
            throw new Error("value not accepted by majority. ");
        }

        if (acceptedResponse.value !== null) {
            throw new Error("already accepted another value. ");
        }

        console.log(`value ${proposeValue} accepted successfully`);
    }
}

class Acceptor {
    private maxId: number = 0;
    private acceptedPropose: Propose | null = null;

    public prepare(prepareId: number): Value {
        console.log(`[Acceptor] starting prepare with id: ${prepareId}`)

        if (prepareId < this.maxId) {
            throw new Error("already accepted a propose with a higher id. ");
        }

        this.maxId = prepareId;


        if (this.acceptedPropose !== null) {
            const value = this.acceptedPropose.data.value;
            console.log(`[Acceptor] finishing prepare with id: ${prepareId} and value: ${value}`);
            return { id: prepareId, value: value } as Value;
        }

        console.log(`[Acceptor] finishing prepare with id: ${prepareId} and value: null`);
        return { id: prepareId, value: null } as Value;
    }

    public propose(propose: Propose): Value {
        console.log(`[Acceptor] starting propose with id: ${propose.data.id} and value: ${propose.data.value}`);

        if (this.maxId != propose.data.id) {
            throw new Error("cannot accept propose with lower id. ");
        }

        this.acceptedPropose = propose;
        console.log(`[Acceptor] finishing propose with id: ${propose.data.id} and value: ${propose.data.value}`);

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
    return res.status(200).send("Accepted");
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

app.listen(port, () => console.log("running on port: " + port)); 