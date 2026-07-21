import { assert, it } from 'vitest';
import {
    artifactOperationStatus,
    hasRowProgress,
} from '../../app/components/operation-progress';

it('shows row progress only for operations that process rows', () => {
    assert.isTrue(hasRowProgress('import'));
    assert.isTrue(hasRowProgress('restore'));
    assert.isFalse(hasRowProgress('backup'));
    assert.isFalse(hasRowProgress('export'));
});

it('describes completed artifact operations as ready', () => {
    assert.strictEqual(
        artifactOperationStatus('backup', 'completed'),
        'Backup file ready to download.',
    );
    assert.strictEqual(
        artifactOperationStatus('export', 'completed'),
        'Export file ready to download.',
    );
});
