#!/usr/bin/env python3

import json
import os
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
import uuid

logger = logging.getLogger('task_manager')

class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"

class TaskPriority(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

@dataclass
class SubTask:
    id: str
    title: str
    completed: bool
    created_at: str
    
    @classmethod
    def create(cls, title: str) -> 'SubTask':
        return cls(
            id=str(uuid.uuid4()),
            title=title,
            completed=False,
            created_at=datetime.now(timezone.utc).isoformat()
        )

@dataclass
class TaskComment:
    id: str
    content: str
    author: str
    created_at: str
    attachments: Optional[List[str]] = None
    
    @classmethod
    def create(cls, content: str, author: str) -> 'TaskComment':
        return cls(
            id=str(uuid.uuid4()),
            content=content,
            author=author,
            created_at=datetime.now(timezone.utc).isoformat(),
            attachments=[]
        )

@dataclass
class Task:
    id: str
    document_id: str
    title: str
    description: str
    status: str
    priority: str
    created_by: str
    created_at: str
    updated_at: str
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None
    subtasks: Optional[List[SubTask]] = None
    comments: Optional[List[TaskComment]] = None
    attachments: Optional[List[str]] = None
    dependencies: Optional[List[str]] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    
    @classmethod
    def create(cls, document_id: str, title: str, description: str, created_by: str, 
               priority: str = "medium", assignee: Optional[str] = None) -> 'Task':
        now = datetime.now(timezone.utc).isoformat()
        return cls(
            id=str(uuid.uuid4()),
            document_id=document_id,
            title=title,
            description=description,
            status=TaskStatus.PENDING.value,
            priority=priority,
            created_by=created_by,
            created_at=now,
            updated_at=now,
            assignee=assignee,
            tags=[],
            subtasks=[],
            comments=[],
            attachments=[],
            dependencies=[]
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert task to dictionary for JSON serialization"""
        data = asdict(self)
        # Convert subtasks and comments to dictionaries
        if self.subtasks:
            data['subtasks'] = [asdict(subtask) for subtask in self.subtasks]
        if self.comments:
            data['comments'] = [asdict(comment) for comment in self.comments]
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Task':
        """Create task from dictionary"""
        # Convert subtasks back to SubTask objects
        subtasks = []
        if data.get('subtasks'):
            subtasks = [SubTask(**subtask) for subtask in data['subtasks']]
        
        # Convert comments back to TaskComment objects
        comments = []
        if data.get('comments'):
            comments = [TaskComment(**comment) for comment in data['comments']]
        
        # Create task with converted objects
        task_data = data.copy()
        task_data['subtasks'] = subtasks
        task_data['comments'] = comments
        
        return cls(**task_data)

class TaskManager:
    def __init__(self, database_dir: str = 'database'):
        self.database_dir = database_dir
        self.tasks_file = os.path.join(database_dir, 'tasks.json')
        self.tasks: Dict[str, Task] = {}
        self._ensure_database_dir()
        self._load_tasks()
    
    def _ensure_database_dir(self):
        """Ensure database directory exists"""
        if not os.path.exists(self.database_dir):
            os.makedirs(self.database_dir)
            logger.info(f"📁 Created database directory: {self.database_dir}")
    
    def _load_tasks(self):
        """Load all tasks from file"""
        try:
            if os.path.exists(self.tasks_file):
                with open(self.tasks_file, 'r') as f:
                    tasks_data = json.load(f)
                    self.tasks = {
                        task_id: Task.from_dict(task_data) 
                        for task_id, task_data in tasks_data.items()
                    }
                    logger.info(f"📋 Loaded {len(self.tasks)} tasks from {self.tasks_file}")
            else:
                self.tasks = {}
                logger.info("📋 No existing tasks file found. Starting fresh.")
        except Exception as e:
            logger.error(f"❌ Error loading tasks: {e}")
            self.tasks = {}
    
    def _save_tasks(self):
        """Save all tasks to file"""
        try:
            tasks_data = {
                task_id: task.to_dict() 
                for task_id, task in self.tasks.items()
            }
            with open(self.tasks_file, 'w') as f:
                json.dump(tasks_data, f, indent=2)
            logger.info(f"💾 Saved {len(self.tasks)} tasks to {self.tasks_file}")
        except Exception as e:
            logger.error(f"❌ Error saving tasks: {e}")
    
    def create_task(self, document_id: str, title: str, description: str, 
                   created_by: str, priority: str = "medium", 
                   assignee: Optional[str] = None, tags: Optional[List[str]] = None,
                   due_date: Optional[str] = None) -> Task:
        """Create a new task"""
        # Validate priority
        if priority not in [p.value for p in TaskPriority]:
            raise ValueError(f"Invalid priority: {priority}")
        
        task = Task.create(
            document_id=document_id,
            title=title,
            description=description,
            created_by=created_by,
            priority=priority,
            assignee=assignee
        )
        
        if tags:
            task.tags = tags
        if due_date:
            task.due_date = due_date
        
        self.tasks[task.id] = task
        self._save_tasks()
        
        logger.info(f"✅ Created task: {task.id} - {title}")
        return task
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a task by ID"""
        return self.tasks.get(task_id)
    
    def get_tasks_by_document(self, document_id: str) -> List[Task]:
        """Get all tasks for a specific document"""
        return [task for task in self.tasks.values() if task.document_id == document_id]
    
    def get_tasks_by_assignee(self, assignee: str) -> List[Task]:
        """Get all tasks assigned to a specific user"""
        return [task for task in self.tasks.values() if task.assignee == assignee]
    
    def get_tasks_by_status(self, status: str) -> List[Task]:
        """Get all tasks with a specific status"""
        return [task for task in self.tasks.values() if task.status == status]
    
    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Task]:
        """Update a task"""
        task = self.tasks.get(task_id)
        if not task:
            return None
        
        # Validate status if provided
        if 'status' in updates and updates['status'] not in [s.value for s in TaskStatus]:
            raise ValueError(f"Invalid status: {updates['status']}")
        
        # Validate priority if provided
        if 'priority' in updates and updates['priority'] not in [p.value for p in TaskPriority]:
            raise ValueError(f"Invalid priority: {updates['priority']}")
        
        # Update fields
        for key, value in updates.items():
            if hasattr(task, key):
                setattr(task, key, value)
        
        # Update timestamp
        task.updated_at = datetime.now(timezone.utc).isoformat()
        
        self._save_tasks()
        logger.info(f"✅ Updated task: {task_id}")
        return task
    
    def delete_task(self, task_id: str) -> bool:
        """Delete a task"""
        if task_id in self.tasks:
            del self.tasks[task_id]
            self._save_tasks()
            logger.info(f"✅ Deleted task: {task_id}")
            return True
        return False
    
    def delete_tasks_by_document(self, document_id: str) -> int:
        """Delete all tasks for a specific document"""
        tasks_to_delete = [task_id for task_id, task in self.tasks.items() if task.document_id == document_id]
        deleted_count = 0
        
        for task_id in tasks_to_delete:
            del self.tasks[task_id]
            deleted_count += 1
        
        if deleted_count > 0:
            self._save_tasks()
            logger.info(f"✅ Deleted {deleted_count} tasks for document: {document_id}")
        
        return deleted_count
    
    def add_subtask(self, task_id: str, title: str) -> Optional[SubTask]:
        """Add a subtask to a task"""
        task = self.tasks.get(task_id)
        if not task:
            return None
        
        # Ensure subtasks list exists
        if task.subtasks is None:
            task.subtasks = []
        
        subtask = SubTask.create(title)
        task.subtasks.append(subtask)
        task.updated_at = datetime.now(timezone.utc).isoformat()
        
        self._save_tasks()
        logger.info(f"✅ Added subtask to task: {task_id}")
        return subtask
    
    def update_subtask(self, task_id: str, subtask_id: str, completed: bool) -> Optional[SubTask]:
        """Update a subtask"""
        task = self.tasks.get(task_id)
        if not task or task.subtasks is None:
            return None
        
        for subtask in task.subtasks:
            if subtask.id == subtask_id:
                subtask.completed = completed
                task.updated_at = datetime.now(timezone.utc).isoformat()
                self._save_tasks()
                logger.info(f"✅ Updated subtask: {subtask_id}")
                return subtask
        
        return None
    
    def delete_subtask(self, task_id: str, subtask_id: str) -> bool:
        """Delete a subtask"""
        task = self.tasks.get(task_id)
        if not task or task.subtasks is None:
            return False
        
        task.subtasks = [st for st in task.subtasks if st.id != subtask_id]
        task.updated_at = datetime.now(timezone.utc).isoformat()
        
        self._save_tasks()
        logger.info(f"✅ Deleted subtask: {subtask_id}")
        return True
    
    def add_comment(self, task_id: str, content: str, author: str) -> Optional[TaskComment]:
        """Add a comment to a task"""
        task = self.tasks.get(task_id)
        if not task:
            return None
        
        # Ensure comments list exists
        if task.comments is None:
            task.comments = []
        
        comment = TaskComment.create(content, author)
        task.comments.append(comment)
        task.updated_at = datetime.now(timezone.utc).isoformat()
        
        self._save_tasks()
        logger.info(f"✅ Added comment to task: {task_id}")
        return comment
    
    def delete_comment(self, task_id: str, comment_id: str) -> bool:
        """Delete a comment from a task"""
        task = self.tasks.get(task_id)
        if not task or task.comments is None:
            return False
        
        task.comments = [c for c in task.comments if c.id != comment_id]
        task.updated_at = datetime.now(timezone.utc).isoformat()
        
        self._save_tasks()
        logger.info(f"✅ Deleted comment: {comment_id}")
        return True
    
    def search_tasks(self, query: str, document_id: Optional[str] = None) -> List[Task]:
        """Search tasks by title, description, or tags"""
        results = []
        query_lower = query.lower()
        
        for task in self.tasks.values():
            # Filter by document if specified
            if document_id and task.document_id != document_id:
                continue
            
            # Search in title, description, and tags
            if (query_lower in task.title.lower() or 
                query_lower in task.description.lower() or
                any(query_lower in tag.lower() for tag in task.tags or [])):
                results.append(task)
        
        return results
    
    def get_task_statistics(self, document_id: Optional[str] = None) -> Dict[str, Any]:
        """Get task statistics"""
        tasks = self.tasks.values()
        if document_id:
            tasks = [t for t in tasks if t.document_id == document_id]
        
        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t.status == TaskStatus.COMPLETED.value])
        in_progress_tasks = len([t for t in tasks if t.status == TaskStatus.IN_PROGRESS.value])
        pending_tasks = len([t for t in tasks if t.status == TaskStatus.PENDING.value])
        blocked_tasks = len([t for t in tasks if t.status == TaskStatus.BLOCKED.value])
        
        return {
            'total': total_tasks,
            'completed': completed_tasks,
            'in_progress': in_progress_tasks,
            'pending': pending_tasks,
            'blocked': blocked_tasks,
            'completion_rate': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        } 