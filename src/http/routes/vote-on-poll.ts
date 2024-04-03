import { FastifyInstance } from "fastify"
import { prisma } from "../../lib/prisma"
import { z } from "zod"
import { randomUUID } from "crypto"
import { redis } from "../../lib/redis"
import { voting } from "../../utils/voting-pub-sub"

const TimeToExpireCookie = 60 * 60 * 24 * 30 // 30 days

export async function voteOnPoll(app: FastifyInstance) {
    app.post('/polls/:pollId/votes', async (request, reply) => {
        
        try {

            const voteOnPollBody = z.object({
                pollOptionId: z.string().uuid(),
            })

            const voteOnPollParams = z.object({
                pollId: z.string().uuid(),
            })
            
            const { pollId } = voteOnPollParams.parse(request.params)
            const { pollOptionId } = voteOnPollBody.parse(request.body)

            let { sessionId } = request.cookies

            if (!sessionId) {
                
                sessionId = randomUUID()

                reply.setCookie('sessionId', sessionId, {
                    path: '/',
                    maxAge:  TimeToExpireCookie,
                    signed: true,
                    httpOnly: true,
                })
            }

            if (sessionId) {
                const userPreviousVoteOnPoll = await prisma.vote.findUnique({
                    where: {
                        sessionId_pollId: {
                            sessionId,
                            pollId
                        }
                    }
                })

                if (userPreviousVoteOnPoll && userPreviousVoteOnPoll.pollOptionId !== pollOptionId) {
                    await prisma.vote.delete({
                        where: {
                            id: userPreviousVoteOnPoll.id,
                        }
                    })

                    const votes = await redis.zincrby(pollId, -1, userPreviousVoteOnPoll.pollOptionId)

                    voting.publish(pollId, {
                        pollOptionId: userPreviousVoteOnPoll.pollOptionId,
                        votes: Number(votes),
                    })

                } else if (userPreviousVoteOnPoll) {
                    return reply.status(400).send({ message: 'Already voted!'})
                }
            }

            await prisma.vote.create({
                data: {
                    sessionId,
                    pollId,
                    pollOptionId,
                }
            })
       
            const votes = await redis.zincrby(pollId, 1, pollOptionId)
            
            voting.publish(pollId, {
                pollOptionId,
                votes: Number(votes),
            })
            
            return reply.status(201).send()

        } catch (error) {
            return reply.status(400).send({ error: Error })
        }

    }) 
}