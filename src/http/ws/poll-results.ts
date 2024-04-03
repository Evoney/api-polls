import { FastifyInstance } from 'fastify'
import { voting } from '../../utils/voting-pub-sub'
import z from 'zod'

const getPollParams = z.object({
    pollId: z.string().uuid(),
})

export async function pollResults(app : FastifyInstance) {
    app.get('/polls/:pollId/results', { websocket: true }, (connection, request) => {
        const { pollId } = getPollParams.parse(request.params)
        voting.subscribe(pollId, (message) => {
        connection.socket.send(JSON.stringify(message))
       })
    })
}

// Pub/Sub - Publish/Subscribers