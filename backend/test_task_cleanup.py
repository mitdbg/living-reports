#!/usr/bin/env python3

import json
import os
from task_manager import TaskManager

def test_task_cleanup():
    """Test that tasks are properly cleaned up when deleting documents"""
    
    # Use a test database directory
    test_db_dir = 'test_database'
    task_manager = TaskManager(test_db_dir)
    
    print("🧪 Testing task cleanup functionality...")
    
    # Create some test tasks
    print("\n1. Creating test tasks...")
    task1 = task_manager.create_task(
        document_id="test-doc-1",
        title="Test Task 1",
        description="This is a test task",
        created_by="test_user"
    )
    task2 = task_manager.create_task(
        document_id="test-doc-1", 
        title="Test Task 2",
        description="Another test task",
        created_by="test_user"
    )
    task3 = task_manager.create_task(
        document_id="test-doc-2",
        title="Test Task 3", 
        description="Task for different document",
        created_by="test_user"
    )
    
    print(f"✅ Created 3 tasks: {task1.id}, {task2.id}, {task3.id}")
    
    # Check initial state
    print("\n2. Checking initial task count...")
    all_tasks = list(task_manager.tasks.values())
    doc1_tasks = task_manager.get_tasks_by_document("test-doc-1")
    doc2_tasks = task_manager.get_tasks_by_document("test-doc-2")
    
    print(f"✅ Total tasks: {len(all_tasks)}")
    print(f"✅ Tasks for test-doc-1: {len(doc1_tasks)}")
    print(f"✅ Tasks for test-doc-2: {len(doc2_tasks)}")
    
    # Test task cleanup for document 1
    print("\n3. Testing task cleanup for test-doc-1...")
    deleted_count = task_manager.delete_tasks_by_document("test-doc-1")
    print(f"✅ Deleted {deleted_count} tasks for test-doc-1")
    
    # Check state after cleanup
    print("\n4. Checking state after cleanup...")
    all_tasks_after = list(task_manager.tasks.values())
    doc1_tasks_after = task_manager.get_tasks_by_document("test-doc-1")
    doc2_tasks_after = task_manager.get_tasks_by_document("test-doc-2")
    
    print(f"✅ Total tasks after cleanup: {len(all_tasks_after)}")
    print(f"✅ Tasks for test-doc-1 after cleanup: {len(doc1_tasks_after)}")
    print(f"✅ Tasks for test-doc-2 after cleanup: {len(doc2_tasks_after)}")
    
    # Verify results
    if len(doc1_tasks_after) == 0 and len(doc2_tasks_after) == 1:
        print("✅ Test PASSED: Tasks for test-doc-1 were properly deleted")
    else:
        print("❌ Test FAILED: Task cleanup didn't work as expected")
        return False
    
    # Clean up test database
    print("\n5. Cleaning up test database...")
    import shutil
    if os.path.exists(test_db_dir):
        shutil.rmtree(test_db_dir)
        print("✅ Test database cleaned up")
    
    print("\n🎉 Task cleanup test completed successfully!")
    return True

if __name__ == "__main__":
    test_task_cleanup() 