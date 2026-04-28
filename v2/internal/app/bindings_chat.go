// Wails bindings for chat conversations and messaging.
// Author: Subash Karki
package app

import (
	"log"

	"github.com/subashkarki/phantom-os-v2/internal/chat"
)

// GetConversations returns all chat conversations for a workspace.
func (a *App) GetConversations(workspaceID string) []chat.Conversation {
	if a.Chat == nil {
		return []chat.Conversation{}
	}
	convs, err := a.Chat.ListConversations(a.ctx, workspaceID)
	if err != nil {
		log.Printf("app/bindings_chat: GetConversations(%s): %v", workspaceID, err)
		return []chat.Conversation{}
	}
	return convs
}

// CreateConversation creates a new chat conversation.
func (a *App) CreateConversation(workspaceID, title, model string) *chat.Conversation {
	if a.Chat == nil {
		log.Println("app/bindings_chat: CreateConversation: chat service not initialised")
		return nil
	}
	conv, err := a.Chat.CreateConversation(a.ctx, workspaceID, title, model)
	if err != nil {
		log.Printf("app/bindings_chat: CreateConversation: %v", err)
		return nil
	}
	return conv
}

// UpdateConversationTitle updates the title of a conversation.
func (a *App) UpdateConversationTitle(conversationID, title string) error {
	if a.Chat == nil {
		return nil
	}
	if err := a.Chat.UpdateTitle(a.ctx, conversationID, title); err != nil {
		log.Printf("app/bindings_chat: UpdateConversationTitle(%s): %v", conversationID, err)
		return err
	}
	return nil
}

// DeleteConversation removes a conversation and all its messages.
func (a *App) DeleteConversation(conversationID string) error {
	if a.Chat == nil {
		return nil
	}
	if err := a.Chat.DeleteConversation(a.ctx, conversationID); err != nil {
		log.Printf("app/bindings_chat: DeleteConversation(%s): %v", conversationID, err)
		return err
	}
	return nil
}

// GetChatHistory returns all messages for a conversation in chronological order.
func (a *App) GetChatHistory(conversationID string) []chat.Message {
	if a.Chat == nil {
		return []chat.Message{}
	}
	msgs, err := a.Chat.GetHistory(a.ctx, conversationID)
	if err != nil {
		log.Printf("app/bindings_chat: GetChatHistory(%s): %v", conversationID, err)
		return []chat.Message{}
	}
	return msgs
}

// SendChatMessage sends a user message, streams the AI response via "chat:stream"
// events, and returns the completed assistant message. The frontend should
// listen for "chat:stream" events to display the response in real time.
func (a *App) SendChatMessage(conversationID, content, model string) *chat.Message {
	if a.Chat == nil {
		log.Println("app/bindings_chat: SendChatMessage: chat service not initialised")
		return nil
	}

	// Run in a goroutine so the Wails binding returns immediately while
	// streaming events flow to the frontend. The final message is also
	// emitted as a "chat:message-complete" event.
	go func() {
		msg, err := a.Chat.SendMessage(a.ctx, conversationID, content, model)
		if err != nil {
			log.Printf("app/bindings_chat: SendChatMessage: %v", err)
			return
		}
		EmitEvent(a.ctx, "chat:message-complete", msg)
	}()

	return nil
}
