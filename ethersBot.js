const ethers = require('ethers')
const fs = require('fs')
const abi = fs.readFileSync('./abi.json', {encoding: 'utf8'});
let config = fs.readFileSync('./config.json', {encoding: 'utf8'})

require('dotenv').config();

const main = async () => {
    // PingPong Contract Address    
    const contractAddress= '0xfba6861a0C704872A89FB76a1E7114CfE8e83289'
    // Web3 Provider - Infura
    const provider = new ethers.providers.WebSocketProvider(
        `wss://kovan.infura.io/ws/v3/${process.env.KEY}`
    )
    // Defining signer using the private key
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    // Contract Instance
    const contract = new ethers.Contract(contractAddress, abi, signer);
    
    // filter for filtering out Ping event on contract
    filter = {
        address: contractAddress,
        topics: [
            ethers.utils.id("Ping()")
        ]
    }
    // array of events
    let events = [];
    // config containing startBlock and the last registered nonce of the sender
    // nonce is saved in case bot crashes and need to check if before crashing the last tx sent was mined or not
    config = JSON.parse(config)

    // current BlockNumber
    const currentBlock = await provider.getBlockNumber();

    // After crash check
    const checkNonce = async () => {
        const txCount = await provider.getTransactionCount(signer.address)
        // checking if the last tx before crash went through or not
        if(txCount == config.nonce) {
            // if last tx didn't go through then startBlock will be decreased by 1, to resend that tx.
            config.startBlock -= 1;
            config.nonce -= 1;
        }
    }

    if(config.nonce != 0) { 
        await checkNonce();
    } else {
        // When bot starts at beginning 
        const txCount = await provider.getTransactionCount(signer.address);
        config.nonce = txCount-1;
    }
    
    // fetching all events from startBlock to currentBlock
    events = await contract.queryFilter("Ping", config.startBlock, currentBlock)


    const firePong = async (event) => {

        let blockNumber = await event.blockNumber;
        config.startBlock = blockNumber+1;
        config.nonce += 1;        
        // saving new config to file to stay updated in case of crash.
        fs.writeFileSync('./config.json', JSON.stringify(config));

        tx = await contract.connect(signer).pong(event.transactionHash)
        await tx.wait();
    }

    // flag is set to have no clashing nonce
    // while sending pong corresponding to old events(till startBlock), and new event occurs.
    let flag = 0;
    const forLoop = async () => {
        for(i in events) { 
            await firePong(events[i])
        }
        flag = 1;
    }
    forLoop();

    // handling new events triggers
    contract.on(filter, async(log) => {
        if(flag == 0) { 
            // if old events are being handled then new events are pushed to the events array to avoid clashing txs.
            events.push(log)
        } else {
            await firePong(log)
        }
        
    })

}

main()