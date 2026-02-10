"""
CLI commands for auth management.

Usage:
    python -m backend.auth.cli create-super-admin --email admin@example.com --password secret123 --name "Admin Name"
    python -m backend.auth.cli reset-password --email admin@example.com --password newpassword
"""
import argparse
import sys
from backend.core.database import SessionLocal, engine, Base
from backend.auth.models import AuthUser, UserRole
from backend.auth import service


def create_super_admin(email: str, password: str, name: str):
    """Create a super admin user."""
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if email exists
        if service.email_exists(db, email):
            print(f"Error: Email '{email}' already exists.")
            sys.exit(1)
        
        # Check if there's already a super admin
        existing = service.list_super_admins(db)
        if existing:
            print(f"Warning: {len(existing)} super admin(s) already exist.")
            response = input("Create another? (y/N): ")
            if response.lower() != 'y':
                print("Cancelled.")
                sys.exit(0)
        
        user = service.create_super_admin(db, email, password, name)
        print(f"Super admin created successfully!")
        print(f"  ID: {user.id}")
        print(f"  Email: {user.email}")
        print(f"  Name: {user.name}")
    finally:
        db.close()


def reset_password(email: str, password: str):
    """Reset a user's password."""
    db = SessionLocal()
    try:
        user = service.get_by_email(db, email)
        if not user:
            print(f"Error: User '{email}' not found.")
            sys.exit(1)
        
        service.change_password(db, user, password)
        print(f"Password reset successfully for {email}")
    finally:
        db.close()


def list_users():
    """List all auth users."""
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        users = db.query(AuthUser).order_by(AuthUser.role, AuthUser.created_at).all()
        
        if not users:
            print("No users found.")
            return
        
        print(f"\n{'ID':<5} {'Email':<30} {'Name':<20} {'Role':<15} {'Active':<8}")
        print("-" * 80)
        
        for user in users:
            print(f"{user.id:<5} {user.email:<30} {user.name:<20} {user.role.value:<15} {'Yes' if user.is_active else 'No':<8}")
        
        print(f"\nTotal: {len(users)} users")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Auth CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # create-super-admin
    create_parser = subparsers.add_parser("create-super-admin", help="Create a super admin")
    create_parser.add_argument("--email", required=True, help="Email address")
    create_parser.add_argument("--password", required=True, help="Password")
    create_parser.add_argument("--name", required=True, help="Display name")
    
    # reset-password
    reset_parser = subparsers.add_parser("reset-password", help="Reset a user's password")
    reset_parser.add_argument("--email", required=True, help="Email address")
    reset_parser.add_argument("--password", required=True, help="New password")
    
    # list-users
    subparsers.add_parser("list-users", help="List all users")
    
    args = parser.parse_args()
    
    if args.command == "create-super-admin":
        create_super_admin(args.email, args.password, args.name)
    elif args.command == "reset-password":
        reset_password(args.email, args.password)
    elif args.command == "list-users":
        list_users()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
