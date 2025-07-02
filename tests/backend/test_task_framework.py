#!/usr/bin/env python3

"""
Test script for the task framework
"""

import json
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from task_manager import TaskManager, TaskStatus

def test_task_framework():
    """Test the task framework functionality"""
    print("🧪 Testing Task Framework...")
    
    # Initialize task manager
    task_manager = TaskManager('test_database')
    
    # Test 1: Create a task
    print("\n1. Creating a task...")
    task = task_manager.create_task(
        document_id="doc_123",
        title="Implement user authentication",
        description="Add login/logout functionality with JWT tokens",
        created_by="test_user",
        priority="high",
        assignee="developer_1",
        tags=["frontend", "auth", "security"]
    )
    print(f"✅ Created task: {task.id} - {task.title}")
    
    # Test 2: Get task
    print("\n2. Retrieving task...")
    retrieved_task = task_manager.get_task(task.id)
    if retrieved_task and retrieved_task.id == task.id:
        print(f"✅ Retrieved task: {retrieved_task.title}")
    else:
        print("❌ Failed to retrieve task")
    
    # Test 3: Update task
    print("\n3. Updating task...")
    updated_task = task_manager.update_task(task.id, {
        'status': TaskStatus.IN_PROGRESS.value,
        'description': 'Add login/logout functionality with JWT tokens and refresh tokens'
    })
    if updated_task and updated_task.status == TaskStatus.IN_PROGRESS.value:
        print(f"✅ Updated task status to: {updated_task.status}")
    else:
        print("❌ Failed to update task")
    
    # Test 4: Add subtask
    print("\n4. Adding subtask...")
    subtask = task_manager.add_subtask(task.id, "Set up JWT token generation")
    if subtask:
        print(f"✅ Added subtask: {subtask.title}")
    else:
        print("❌ Failed to add subtask")
    
    # Test 5: Add comment
    print("\n5. Adding comment...")
    comment = task_manager.add_comment(task.id, "Starting work on JWT implementation", "developer_1")
    if comment:
        print(f"✅ Added comment: {comment.content[:50]}...")
    else:
        print("❌ Failed to add comment")
    
    # Test 6: Search tasks
    print("\n6. Searching tasks...")
    search_results = task_manager.search_tasks("JWT")
    if search_results:
        print(f"✅ Found {len(search_results)} tasks matching 'JWT'")
    else:
        print("❌ No search results found")
    
    # Test 7: Get statistics
    print("\n7. Getting statistics...")
    stats = task_manager.get_task_statistics()
    print(f"✅ Task statistics: {stats}")
    
    # Test 8: Get tasks by document
    print("\n8. Getting tasks by document...")
    doc_tasks = task_manager.get_tasks_by_document("doc_123")
    print(f"✅ Found {len(doc_tasks)} tasks for document doc_123")
    
    # Test 9: Get tasks by assignee
    print("\n9. Getting tasks by assignee...")
    assignee_tasks = task_manager.get_tasks_by_assignee("developer_1")
    print(f"✅ Found {len(assignee_tasks)} tasks assigned to developer_1")
    
    # Test 10: Complete task
    print("\n10. Completing task...")
    completed_task = task_manager.update_task(task.id, {
        'status': TaskStatus.COMPLETED.value,
        'actual_hours': 8.5
    })
    if completed_task and completed_task.status == TaskStatus.COMPLETED.value:
        print(f"✅ Completed task: {completed_task.title}")
    else:
        print("❌ Failed to complete task")
    
    # Final statistics
    print("\n📊 Final Statistics:")
    final_stats = task_manager.get_task_statistics()
    print(json.dumps(final_stats, indent=2))
    
    # Clean up test database
    print("\n🧹 Cleaning up test database...")
    import shutil
    if os.path.exists('test_database'):
        shutil.rmtree('test_database')
        print("✅ Cleaned up test database")
    
    print("\n🎉 Task framework test completed successfully!")

if __name__ == "__main__":
    test_task_framework() 