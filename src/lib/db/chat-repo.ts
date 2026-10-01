import { sql } from "./client";

/** Record which user owns a conversation (idempotent). Called when a conversation is created. */
export async function recordConversation(conversationId: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO chat_conversations (conversation_id, user_id)
    VALUES (${conversationId}, ${userId})
    ON CONFLICT (conversation_id) DO NOTHING
  `;
}

/** The user id that owns a conversation, or null if unknown. */
export async function getConversationOwner(conversationId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT user_id AS "userId" FROM chat_conversations WHERE conversation_id = ${conversationId}
  `) as { userId: string }[];
  return rows[0]?.userId ?? null;
}
