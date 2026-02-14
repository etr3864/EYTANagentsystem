from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db

router = APIRouter(tags=["database"])


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db)):
    from backend.models.conversation import Conversation
    from backend.models.user import User
    
    convs = db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
    result = []
    for c in convs:
        user = db.query(User).filter(User.id == c.user_id).first()
        result.append({
            "id": c.id,
            "agent_id": c.agent_id,
            "user_id": c.user_id,
            "user_phone": user.phone if user else None,
            "user_name": user.name if user else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        })
    return result


@router.get("/messages")
def list_messages(limit: int = 100, db: Session = Depends(get_db)):
    from backend.models.message import Message
    msgs = db.query(Message).order_by(Message.created_at.desc()).limit(limit).all()
    return [{
        "id": m.id,
        "conversation_id": m.conversation_id,
        "role": m.role,
        "content": m.content,
        "message_type": m.message_type or "text",
        "media_id": m.media_id,
        "media_url": m.media_url,
        "created_at": m.created_at.isoformat() if m.created_at else None
    } for m in msgs]


@router.delete("/messages/{msg_id}")
def delete_message(msg_id: int, db: Session = Depends(get_db)):
    from backend.models.message import Message
    msg = db.query(Message).filter(Message.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(msg)
    db.commit()
    return {"status": "deleted"}


@router.get("/usage")
def list_usage(db: Session = Depends(get_db)):
    """Get cumulative usage stats per agent, broken down by model."""
    from backend.models.agent import Agent
    
    agents = db.query(Agent).order_by(Agent.name).all()
    result = []
    idx = 1  # Artificial id for frontend
    
    for agent in agents:
        if not agent.usage_stats:
            continue
            
        for model, stats in agent.usage_stats.items():
            result.append({
                "id": idx,  # Artificial id for DataTable
                "agent_id": agent.id,
                "agent_name": agent.name,
                "model": model,
                "input_tokens": stats.get("input", 0),
                "output_tokens": stats.get("output", 0),
                "cache_read_tokens": stats.get("cache_read", 0),
                "cache_creation_tokens": stats.get("cache_create", 0),
            })
            idx += 1
    
    return result


@router.get("/appointments")
def list_appointments(db: Session = Depends(get_db)):
    """Get all appointments."""
    from backend.models.appointment import Appointment
    from backend.models.agent import Agent
    from backend.models.user import User
    
    apts = db.query(Appointment).order_by(Appointment.start_time.desc()).all()
    result = []
    
    for apt in apts:
        agent = db.query(Agent).filter(Agent.id == apt.agent_id).first()
        user = db.query(User).filter(User.id == apt.user_id).first()
        result.append({
            "id": apt.id,
            "agent_id": apt.agent_id,
            "agent_name": agent.name if agent else None,
            "user_id": apt.user_id,
            "user_name": user.name if user else None,
            "user_phone": user.phone if user else None,
            "title": apt.title,
            "description": apt.description,
            # DB stores UTC - add Z suffix so browser converts to local time
            "start_time": f"{apt.start_time.isoformat()}Z" if apt.start_time else None,
            "end_time": f"{apt.end_time.isoformat()}Z" if apt.end_time else None,
            "status": apt.status,
            "google_event_id": apt.google_event_id,
        })
    
    return result


@router.delete("/appointments/{apt_id}")
def delete_appointment(apt_id: int, db: Session = Depends(get_db)):
    """Delete an appointment."""
    from backend.models.appointment import Appointment
    apt = db.query(Appointment).filter(Appointment.id == apt_id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    db.delete(apt)
    db.commit()
    return {"status": "deleted"}


@router.get("/reminders")
def list_reminders(db: Session = Depends(get_db)):
    """Get all scheduled reminders."""
    from backend.models.scheduled_reminder import ScheduledReminder
    from backend.models.appointment import Appointment
    from backend.models.agent import Agent
    from backend.models.user import User
    
    reminders = db.query(ScheduledReminder).order_by(ScheduledReminder.scheduled_for.desc()).all()
    result = []
    
    for rem in reminders:
        apt = db.query(Appointment).filter(Appointment.id == rem.appointment_id).first()
        agent = db.query(Agent).filter(Agent.id == rem.agent_id).first()
        user = db.query(User).filter(User.id == rem.user_id).first()
        result.append({
            "id": rem.id,
            "appointment_id": rem.appointment_id,
            "appointment_title": apt.title if apt else None,
            "agent_id": rem.agent_id,
            "agent_name": agent.name if agent else None,
            "user_id": rem.user_id,
            "user_name": user.name if user else None,
            "user_phone": user.phone if user else None,
            "scheduled_for": f"{rem.scheduled_for.isoformat()}Z" if rem.scheduled_for else None,
            "status": rem.status,
            "send_to_customer": rem.send_to_customer,
            "send_to_business": rem.send_to_business,
            "channel": rem.channel,
            "content_type": rem.content_type,
            "sent_at": f"{rem.sent_at.isoformat()}Z" if rem.sent_at else None,
            "error_message": rem.error_message,
        })
    
    return result


@router.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: int, db: Session = Depends(get_db)):
    """Delete a scheduled reminder."""
    from backend.models.scheduled_reminder import ScheduledReminder
    rem = db.query(ScheduledReminder).filter(ScheduledReminder.id == reminder_id).first()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete(rem)
    db.commit()
    return {"status": "deleted"}


@router.get("/summaries")
def list_summaries(db: Session = Depends(get_db)):
    """Get all conversation summaries."""
    from backend.models.conversation_summary import ConversationSummary
    from backend.models.agent import Agent
    from backend.models.user import User
    
    summaries = db.query(ConversationSummary).order_by(ConversationSummary.created_at.desc()).all()
    result = []
    
    for s in summaries:
        agent = db.query(Agent).filter(Agent.id == s.agent_id).first()
        user = db.query(User).filter(User.id == s.user_id).first()
        result.append({
            "id": s.id,
            "conversation_id": s.conversation_id,
            "agent_id": s.agent_id,
            "agent_name": agent.name if agent else None,
            "user_id": s.user_id,
            "user_name": user.name if user else None,
            "user_phone": user.phone if user else None,
            "summary_text": s.summary_text[:100] + "..." if s.summary_text and len(s.summary_text) > 100 else s.summary_text,
            "message_count": s.message_count,
            "webhook_status": s.webhook_status,
            "webhook_attempts": s.webhook_attempts,
            "webhook_last_error": s.webhook_last_error,
            "webhook_sent_at": f"{s.webhook_sent_at.isoformat()}Z" if s.webhook_sent_at else None,
            "next_retry_at": f"{s.next_retry_at.isoformat()}Z" if s.next_retry_at else None,
            "created_at": f"{s.created_at.isoformat()}Z" if s.created_at else None,
        })
    
    return result


@router.delete("/summaries/{summary_id}")
def delete_summary(summary_id: int, db: Session = Depends(get_db)):
    """Delete a conversation summary."""
    from backend.models.conversation_summary import ConversationSummary
    s = db.query(ConversationSummary).filter(ConversationSummary.id == summary_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Summary not found")
    db.delete(s)
    db.commit()
    return {"status": "deleted"}


@router.get("/media")
def list_media(db: Session = Depends(get_db)):
    """Get all agent media files."""
    from backend.models.agent_media import AgentMedia
    from backend.models.agent import Agent
    
    media_items = db.query(AgentMedia).order_by(AgentMedia.created_at.desc()).all()
    result = []
    
    for m in media_items:
        agent = db.query(Agent).filter(Agent.id == m.agent_id).first()
        item = {
            "id": m.id,
            "agent_id": m.agent_id,
            "agent_name": agent.name if agent else None,
            "media_type": m.media_type,
            "name": m.name,
            "description": m.description,
            "file_url": m.file_url,
            "file_size": m.file_size,
            "original_size": m.original_size,
            "mime_type": m.mime_type,
            "is_active": m.is_active,
            "created_at": f"{m.created_at.isoformat()}Z" if m.created_at else None,
        }
        if m.media_type == "document":
            item["filename"] = m.filename
        result.append(item)
    
    return result


@router.delete("/media/{media_id}")
def delete_media(media_id: int, db: Session = Depends(get_db)):
    """Delete an agent media file."""
    from backend.models.agent_media import AgentMedia
    m = db.query(AgentMedia).filter(AgentMedia.id == media_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Media not found")
    db.delete(m)
    db.commit()
    return {"status": "deleted"}


@router.get("/followups")
def list_followups(db: Session = Depends(get_db)):
    """Get all scheduled follow-ups."""
    from backend.models.scheduled_followup import ScheduledFollowup
    from backend.models.agent import Agent
    from backend.models.user import User

    items = db.query(ScheduledFollowup).order_by(ScheduledFollowup.scheduled_for.desc()).all()
    result = []
    for fu in items:
        agent = db.query(Agent).filter(Agent.id == fu.agent_id).first()
        user = db.query(User).filter(User.id == fu.user_id).first()
        result.append({
            "id": fu.id,
            "conversation_id": fu.conversation_id,
            "agent_id": fu.agent_id,
            "agent_name": agent.name if agent else None,
            "user_id": fu.user_id,
            "user_name": user.name if user else None,
            "user_phone": user.phone if user else None,
            "followup_number": fu.followup_number,
            "status": fu.status,
            "scheduled_for": f"{fu.scheduled_for.isoformat()}Z" if fu.scheduled_for else None,
            "sent_at": f"{fu.sent_at.isoformat()}Z" if fu.sent_at else None,
            "content": fu.content[:100] + "..." if fu.content and len(fu.content) > 100 else fu.content,
            "ai_reason": fu.ai_reason,
            "sent_via": fu.sent_via,
            "template_name": fu.template_name,
            "created_at": f"{fu.created_at.isoformat()}Z" if fu.created_at else None,
        })
    return result


@router.delete("/followups/{followup_id}")
def delete_followup(followup_id: int, db: Session = Depends(get_db)):
    """Delete a scheduled follow-up."""
    from backend.models.scheduled_followup import ScheduledFollowup
    fu = db.query(ScheduledFollowup).filter(ScheduledFollowup.id == followup_id).first()
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    db.delete(fu)
    db.commit()
    return {"status": "deleted"}


@router.get("/templates")
def list_templates(db: Session = Depends(get_db)):
    """List all WhatsApp templates across all agents."""
    from backend.models.whatsapp_template import WhatsAppTemplate
    from backend.models.agent import Agent

    templates = db.query(WhatsAppTemplate).order_by(WhatsAppTemplate.created_at.desc()).all()
    result = []
    for t in templates:
        agent = db.query(Agent).filter(Agent.id == t.agent_id).first()
        result.append({
            "id": t.id,
            "agent_id": t.agent_id,
            "agent_name": agent.name if agent else None,
            "name": t.name,
            "language": t.language,
            "category": t.category,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return result


@router.delete("/templates/{template_id}")
def delete_template_db(template_id: int, db: Session = Depends(get_db)):
    """Delete a template from DB (does NOT delete from Meta)."""
    from backend.models.whatsapp_template import WhatsAppTemplate
    t = db.query(WhatsAppTemplate).filter(WhatsAppTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"status": "deleted"}
