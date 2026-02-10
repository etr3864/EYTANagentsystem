from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.logger import log
from backend.api.schemas import SendMessageRequest
from backend.services import conversations, messages, agents, users, providers

router = APIRouter(tags=["conversations"])


@router.get("/{conv_id}/messages")
def list_messages(conv_id: int, db: Session = Depends(get_db)):
    return messages.get_history(db, conv_id)


@router.post("/{conv_id}/send")
async def send_message(conv_id: int, req: SendMessageRequest, db: Session = Depends(get_db)):
    """Send a message to a conversation via WhatsApp."""
    # Get conversation
    conv = conversations.get_by_id(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Get agent and user
    agent = agents.get_by_id(db, conv.agent_id)
    user = users.get_by_id(db, conv.user_id)
    
    if not agent or not user:
        raise HTTPException(status_code=404, detail="Agent or user not found")
    
    if not agent.is_active:
        raise HTTPException(status_code=400, detail="Agent is not active")
    
    # Send via appropriate provider
    success = await providers.send_message(agent, user.phone, req.text)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send message")
    
    # Save to DB with manual indicator
    msg = messages.add(db, conv_id, "assistant", req.text, message_type="manual")
    log("MANUAL_SEND", agent=agent.name, user=user.name or user.phone[-4:])
    
    return {
        "status": "sent",
        "message_id": msg.id
    }


@router.post("/{conv_id}/pause")
def pause_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Pause AI responses for this conversation."""
    conv = conversations.set_paused(db, conv_id, True)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "paused", "is_paused": True}


@router.post("/{conv_id}/resume")
def resume_conversation(conv_id: int, db: Session = Depends(get_db)):
    """Resume AI responses for this conversation."""
    conv = conversations.set_paused(db, conv_id, False)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "resumed", "is_paused": False}


@router.delete("/{conv_id}")
def delete_conversation(conv_id: int, db: Session = Depends(get_db)):
    if not conversations.delete(db, conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}
